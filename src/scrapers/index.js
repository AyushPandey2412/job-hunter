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
    stats.duplicates ??= 0;
    stats.rejected ??= 0;
    stats.rejectionReasons ??= {};
    stats.rejectedExamples ??= [];

    for (const job of jobs) {
      const evaluation = filterService.assess(job);
      job.matchQuality = evaluation.matchQuality;
      job.matchReasons = evaluation.matchReasons;
      job.experienceLevel = evaluation.experienceLevel;
      job.matchScore = evaluation.score;
      const fingerprint = dedupService.generateFingerprint(
        job.company,
        job.title,
        job.location,
        job.url
      );

      // Deduplication check
      if (await dedupService.isDuplicate(fingerprint)) {
        stats.duplicates++;
        if (!dedupService.storedFingerprints || dedupService.storedFingerprints.has(fingerprint)) await dbService.enrichJob({ ...job, fingerprint });
        const stored = await dbService.db.prepare('SELECT id FROM jobs WHERE fingerprint=? OR job_url=? LIMIT 1').get(fingerprint, job.url);
        if (stored) await dbService.updateDiscoveryDetails(stored.id, job);
        continue;
      }

      // Candidate eligibility gate plus existing configurable filters.
      if (evaluation.matched || evaluation.review) {
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

          console.log(`🎯 [${evaluation.review ? 'REVIEW' : 'MATCH'}] "${job.title}" @ ${job.company} (${job.matchScore}%, ${job.location}, ${job.experienceLevel})`);

          // Dispatch Discord alert
          try {
            const alerted = evaluation.matched && await discordService.sendJobAlert(job);
            if (alerted) stats.alertsSent++;
          } catch (alertErr) {
            console.error('❌ Failed to alert Discord:', alertErr.message);
          }
        }
      } else {
        stats.rejected++;
        stats.rejectionReasons[evaluation.reason] = (stats.rejectionReasons[evaluation.reason] || 0) + 1;
        if (stats.rejectedExamples.length < 10) stats.rejectedExamples.push({ title: job.title, url: job.url, reason: evaluation.reason });
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
    const startedAt = new Date().toISOString();
    const started = Date.now();
    try {
      await require('../services/preferences').ready;
      const config = require('../config');
      const configMap = new Map(config.companies.map(c => [c.token, c]));
      const companies = await dbService.getCompanies();
      dedupService.preload(await dbService.getFingerprints());
      const adapters = { greenhouse: greenhouseScraper, lever: leverScraper, ashby: ashbyScraper,
        workday: workdayScraper, smartrecruiters: smartRecruitersScraper,
        enterprise_india: enterpriseIndiaScraper, ibm: require('./ibm'), amazon: require('./amazon'),
        microsoft: require('./microsoft'), google: require('./google'), oracle: require('./oracle'), sap: require('./sap') };
      const stats = { totalChecked: 0, newFound: 0, alertsSent: 0 };
      const discoveredJobs = [], sources = [];
      const targets = companies.map(row => {
        const company = { ...row, ...configMap.get(row.token) };
        return { name: company.name, company, adapter: adapters[company.ats_type] };
      });
      targets.push({ name: 'Instahyre', adapter: instahyreScraper },
        { name: 'StartupHub', adapter: startupHubScraper }, { name: 'Indeed RSS', adapter: indeedRssScraper });
      for (const target of targets) {
        const source = { name: target.name, totalChecked: 0, newFound: 0, alertsSent: 0 };
        try {
          if (!target.adapter) throw new Error('No adapter configured');
          const result = await target.adapter.fetchJobs(target.company);
          if (result.error) throw new Error(result.error);
          source.warnings = result.warnings || [];
          source.status = source.warnings.length ? (result.jobs?.length ? 'partial' : 'error') : result.modified === false ? 'unchanged' : 'ok';
          source.totalAvailable = result.totalAvailable ?? result.jobs?.length ?? 0;
          source.truncated = !!result.truncated;
          await this.processJobBatch(result.jobs, source, discoveredJobs);
          // Commit source validators only after jobs have been processed successfully.
          if (result.etag) await dbService.updateCompanyEtag(target.name, result.etag);
        } catch (error) {
          source.status = 'error';
          source.error = error.message;
          console.warn('[Discovery] ' + target.name + ': ' + error.message);
        }
        stats.totalChecked += source.totalChecked;
        stats.newFound += source.newFound;
        stats.alertsSent += source.alertsSent;
        sources.push(source);
        console.log('[Discovery] ' + target.name + ': ' + source.status + ', checked ' + source.totalChecked + ', new ' + source.newFound + ', rejected ' + (source.rejected || 0));
      }
      const report = { startedAt, completedAt: new Date().toISOString(), sources,
        totalJobsChecked: stats.totalChecked, newJobsFound: stats.newFound,
        failedSources: sources.filter(source => ['error', 'partial'].includes(source.status)).length };
      await require('../services/scanReport').save(report);
      return { status: report.failedSources ? 'partial' : 'complete', elapsedSeconds: ((Date.now() - started) / 1000).toFixed(1),
        ...report, alertsSent: stats.alertsSent, discoveredJobs };
    } finally { this.isPolling = false; }
  }
}

module.exports = new ScraperCoordinator();
