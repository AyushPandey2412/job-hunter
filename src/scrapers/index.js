const dbService = require('../db/database');
const greenhouseScraper = require('./greenhouse');
const leverScraper = require('./lever');
const ashbyScraper = require('./ashby');
const workdayScraper = require('./workday');
const smartRecruitersScraper = require('./smartrecruiters');
const enterpriseIndiaScraper = require('./enterpriseIndia');
const startupHubScraper = require('./startupHub');
const instahyreScraper = require('./instahyre');
const indeedRssScraper = require('./indeedRss');

const filterService = require('../services/filterService');
const dedupService = require('../services/dedupService');
const discordService = require('../services/discordService');

class ScraperCoordinator {
  constructor() {
    this.isPolling = false;
  }

  /**
   * Evaluates, dedupes, saves and alerts for a batch of discovered jobs
   */
  async processJobBatch(jobs, stats, discoveredList) {
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    stats.totalChecked += jobs.length;

    for (const job of jobs) {
      const fingerprint = dedupService.generateFingerprint(
        job.company,
        job.title,
        job.location,
        job.url
      );

      // Deduplication check
      if (await dedupService.isDuplicate(fingerprint)) {
        if (!dedupService.storedFingerprints || dedupService.storedFingerprints.has(fingerprint)) await dbService.enrichJob({ ...job, fingerprint });
        continue;
      }

      // Filter & Match evaluation (STRICT: 0-2 yrs, max 3 yrs; NO Java/.NET; Target cities or Remote)
      const evaluation = filterService.evaluate(job);

      if (evaluation.matched) {
        job.fingerprint = fingerprint;
        job.matchScore = evaluation.score;
        job.isRemote = evaluation.isRemote;
        job.techStack = evaluation.matchedSkills;
        job.experienceLevel = evaluation.experienceLevel;

        const inserted = await dbService.insertJob(job);
        if (inserted) {
          dedupService.markStored(fingerprint);
          stats.newFound++;
          discoveredList.push(job);

          console.log(`🎯 [MATCH 0-3 YRS] "${job.title}" @ ${job.company} (${job.matchScore}%, ${job.location}, ${job.experienceLevel})`);

          // Dispatch Discord alert
          try {
            const alerted = await discordService.sendJobAlert(job);
            if (alerted) stats.alertsSent++;
          } catch (alertErr) {
            console.error('❌ Failed to alert Discord:', alertErr.message);
          }
        }
      } else {
        dedupService.markSeen(fingerprint);
      }
    }
  }

  /**
   * Runs a complete polling cycle across all active ATS, Enterprise & Hub endpoints
   */
  async runCycle() {
    if (this.isPolling) {
      console.log('⏳ Polling cycle already in progress, skipping duplicate run.');
      return { status: 'already_running' };
    }

    this.isPolling = true;
    const startTime = Date.now();
    console.log('\n🔍 =========================================================');
    console.log(`🚀 [Job Hunter] Starting Global & India Discovery Cycle at ${new Date().toLocaleTimeString()}...`);
    console.log('=========================================================');

    const config = require('../config');
    const configMap = new Map(config.companies.map(c => [c.token, c]));
    const dbCompanies = await dbService.getCompanies();
    dedupService.preload(await dbService.getFingerprints());

    const stats = {
      totalChecked: 0,
      newFound: 0,
      alertsSent: 0
    };
    const discoveredList = [];

    // 1. Direct ATS & Enterprise Giant Endpoints
    for (const dbCompany of dbCompanies) {
      const companyConfig = configMap.get(dbCompany.token) || {};
      const company = { ...dbCompany, ...companyConfig };
      let result = { modified: false, jobs: [] };

      try {
        if (company.ats_type === 'greenhouse') {
          result = await greenhouseScraper.fetchJobs(company);
        } else if (company.ats_type === 'lever') {
          result = await leverScraper.fetchJobs(company);
        } else if (company.ats_type === 'ashby') {
          result = await ashbyScraper.fetchJobs(company);
        } else if (company.ats_type === 'workday') {
          result = await workdayScraper.fetchJobs(company);
        } else if (company.ats_type === 'smartrecruiters') {
          result = await smartRecruitersScraper.fetchJobs(company);
        } else if (company.ats_type === 'enterprise_india') {
          result = await enterpriseIndiaScraper.fetchJobs(company);
        }
      } catch (err) {
        console.warn(`⚠️ Error scraping ${company.name}:`, err.message);
        continue;
      }

      if (result.etag) {
        await dbService.updateCompanyEtag(company.name, result.etag);
      }

      if (result.jobs && result.jobs.length > 0) {
        await this.processJobBatch(result.jobs, stats, discoveredList);
      }
    }

    // 2. Instahyre Verified Indian Product & Startup Hub
    console.log('📡 [Instahyre] Scanning verified Indian tech hubs...');
    try {
      const instaResult = await instahyreScraper.fetchJobs();
      if (instaResult.jobs?.length > 0) {
        console.log(`   Found ${instaResult.jobs.length} jobs on Instahyre.`);
        await this.processJobBatch(instaResult.jobs, stats, discoveredList);
      }
    } catch (err) {
      console.warn('⚠️ Instahyre scan error:', err.message);
    }

    // 3. Startup Hub (RemoteOK, WeWorkRemotely, Himalayas, Jobicy, Remotive)
    console.log('📡 [StartupHub] Scanning Wellfound / YC / Remote startup feeds...');
    try {
      const hubResult = await startupHubScraper.fetchJobs();
      if (hubResult.jobs?.length > 0) {
        console.log(`   Found ${hubResult.jobs.length} jobs on StartupHub.`);
        await this.processJobBatch(hubResult.jobs, stats, discoveredList);
      }
    } catch (err) {
      console.warn('⚠️ StartupHub scan error:', err.message);
    }

    // 4. Indeed Zero-Block RSS Feeds
    console.log('📡 [Indeed RSS] Scanning Indeed syndication feeds...');
    try {
      const indeedResult = await indeedRssScraper.fetchJobs();
      if (indeedResult.jobs?.length > 0) {
        console.log(`   Found ${indeedResult.jobs.length} jobs on Indeed RSS.`);
        await this.processJobBatch(indeedResult.jobs, stats, discoveredList);
      }
    } catch (err) {
      console.warn('⚠️ Indeed RSS scan error:', err.message);
    }

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('=========================================================');
    console.log(`✅ [Cycle Complete in ${elapsedSeconds}s] Checked: ${stats.totalChecked} | 0-3 Yr Matches: ${stats.newFound} | Alerts: ${stats.alertsSent}`);
    console.log('=========================================================\n');

    this.isPolling = false;
    return {
      status: 'complete',
      elapsedSeconds,
      totalJobsChecked: stats.totalChecked,
      newJobsFound: stats.newFound,
      alertsSent: stats.alertsSent,
      discoveredJobs: discoveredList
    };
  }
}

module.exports = new ScraperCoordinator();
