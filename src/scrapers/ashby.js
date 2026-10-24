const axios = require('axios');

class AshbyScraper {
  /**
   * Fetches job openings for a company hosted on Ashby
   */
  async fetchJobs(company) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${company.token}?includeCompensation=true`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (company.last_etag) {
      headers['If-None-Match'] = company.last_etag;
    }

    try {
      const response = await axios.get(url, {
        headers,
        timeout: 10000,
        validateStatus: status => status === 200 || status === 304
      });

      if (response.status === 304) {
        return { modified: false, jobs: [] };
      }

      const newEtag = response.headers['etag'] || null;
      const rawJobs = response.data?.jobs || [];

      const parsedJobs = rawJobs.map(job => {
        const isRemote = !!job.isRemote;
        const location = job.location || (isRemote ? 'Remote' : 'Unspecified');

        return {
          company: company.name,
          title: job.title || '',
          location,
          url: job.jobUrl || `https://jobs.ashbyhq.com/${company.token}/${job.id}`,
          source: 'ashby',
          tier: company.tier,
          isRemote,
          workplaceType: job.workplaceType,
          salary: job.compensation?.compensationTierSummary,
          salaryData: (() => {
            const components = (job.compensation?.summaryComponents || []).filter(c => c.compensationType === 'Salary');
            return components.length === 1 ? { ...components[0], currency: components[0].currencyCode } : undefined;
          })(),
          snippet: (job.descriptionPlain || ''),
          postedAt: job.publishedAt || new Date().toISOString()
        };
      });

      return {
        modified: true,
        etag: newEtag,
        jobs: parsedJobs
      };
    } catch (err) {
      if (err.response?.status === 404) {
        return { modified: false, jobs: [], error: err.message };
      }
      console.warn(`⚠️ [Ashby] Error fetching ${company.name}:`, err.message);
      return { modified: false, jobs: [], error: err.message };
    }
  }
}

module.exports = new AshbyScraper();
