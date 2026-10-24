const axios = require('axios');
const cheerio = require('cheerio');

class StartupHubScraper {
  /**
   * Fetches high-growth funded tech startups (Wellfound / RemoteOK / Himalayas / WeWorkRemotely).
   * Focuses on modern tech stacks: React, Node.js, TypeScript, Python, Full Stack.
   */
  async fetchJobs() {
    const warnings = [];
    const jobs = [];

    // 1. RemoteOK High-Tech Startup API
    try {
      const res = await axios.get('https://remoteok.com/api', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });

      if (Array.isArray(res.data)) {
        const rawJobs = res.data.slice(1, 35); // Skip first legal notice element
        for (const r of rawJobs) {
          if (r.position && r.url) {
            jobs.push({
              company: r.company || 'Tech Startup',
              title: r.position,
              location: r.location || 'Remote',
              url: r.url.startsWith('http') ? r.url : `https://remoteok.com${r.url}`,
              source: 'wellfound-startup',
              tier: 'startup',
              isRemote: true,
              snippet: `${r.position} at ${r.company}. Tags: ${(r.tags || []).join(', ')}.`,
              postedAt: r.date ? new Date(r.date).toISOString() : new Date().toISOString()
            });
          }
        }
      }
    } catch (e) {
      warnings.push(e.message);
      console.warn('⚠️ [StartupHub] Error fetching RemoteOK feed:', e.message);
    }

    // 2. WeWorkRemotely Verified Full Stack / Programming Feed
    try {
      const res = await axios.get('https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const $ = cheerio.load(res.data, { xmlMode: true });

      $('item').each((i, item) => {
        const rawTitle = $(item).find('title').text().trim();
        const link = $(item).find('link').text().trim();
        const pubDate = $(item).find('pubDate').text().trim();

        // Title format is usually "Company: Job Title"
        let company = 'Tech Startup';
        let title = rawTitle;
        if (rawTitle.includes(':')) {
          const parts = rawTitle.split(':');
          company = parts[0].trim();
          title = parts.slice(1).join(':').trim();
        }

        if (title && link) {
          jobs.push({
            company,
            title,
            location: 'Remote',
            url: link,
            source: 'wellfound-startup',
            tier: 'startup',
            isRemote: true,
            snippet: `${title} at ${company}. Verified remote tech startup opportunity.`,
            postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
          });
        }
      });
    } catch (e) {
      warnings.push(e.message);
      console.warn('⚠️ [StartupHub] Error fetching WWR feed:', e.message);
    }

    // 3. Himalayas Tech Startups API
    try {
      const res = await axios.get('https://himalayas.app/jobs/api?limit=25', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });

      const hJobs = res.data?.jobs || [];
      for (const h of hJobs) {
        if (h.title && h.applicationLink) {
          jobs.push({
            company: h.companyName || 'Startup',
            title: h.title,
            location: (h.locationRestrictions || []).join(', ') || 'Remote',
            url: h.applicationLink,
            source: 'wellfound-startup',
            tier: 'startup',
            isRemote: true,
            snippet: `${h.title} at ${h.companyName}. Stack: ${(h.categories || []).join(', ')}.`,
            postedAt: h.pubDate ? new Date(h.pubDate).toISOString() : new Date().toISOString()
          });
        }
      }
    } catch (e) {
      warnings.push(e.message);
      console.warn('⚠️ [StartupHub] Error fetching Himalayas feed:', e.message);
    }

    // 4. Jobicy Developer API
    try {
      const res = await axios.get('https://jobicy.com/api/v2/remote-jobs?count=25&tag=developer', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const jJobs = res.data?.jobs || [];
      for (const j of jJobs) {
        if (j.jobTitle && j.url) {
          jobs.push({
            company: j.companyName || 'Tech Startup',
            title: j.jobTitle,
            location: 'Remote',
            url: j.url,
            source: 'wellfound-startup',
            tier: 'startup',
            isRemote: true,
            snippet: `${j.jobTitle} at ${j.companyName}. Industry: ${j.jobIndustry || ''}. Excerpt: ${j.jobExcerpt || ''}`,
            postedAt: j.pubDate ? new Date(j.pubDate).toISOString() : new Date().toISOString()
          });
        }
      }
    } catch (e) {
      warnings.push(e.message);
      console.warn('⚠️ [StartupHub] Error fetching Jobicy feed:', e.message);
    }

    // 5. Remotive Software Engineering Feed
    try {
      const res = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev&limit=25', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const rJobs = res.data?.jobs || [];
      for (const r of rJobs) {
        if (r.title && r.url) {
          jobs.push({
            company: r.company_name || 'Tech Startup',
            title: r.title,
            location: 'Remote',
            url: r.url,
            source: 'wellfound-startup',
            tier: 'startup',
            isRemote: true,
            snippet: `${r.title} at ${r.company_name}. Category: ${r.category || ''}. Tags: ${(r.tags || []).join(', ')}.`,
            postedAt: r.publication_date ? new Date(r.publication_date).toISOString() : new Date().toISOString()
          });
        }
      }
    } catch (e) {
      warnings.push(e.message);
      console.warn('⚠️ [StartupHub] Error fetching Remotive feed:', e.message);
    }

    return {
      modified: true,
      warnings,
      jobs
    };
  }
}

module.exports = new StartupHubScraper();
