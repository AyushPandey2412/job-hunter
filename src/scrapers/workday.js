const axios = require('axios');

class WorkdayScraper {
  /**
   * Fetches job openings for Workday CXS endpoints
   * company.workdayConfig: { host: '...', tenant: '...', site: '...' }
   */
  async fetchJobs(company) {
    if (!company.workdayConfig) {
      return { modified: false, jobs: [] };
    }

    const { host, tenant, site } = company.workdayConfig;
    const url = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    try {
      const response = await axios.post(
        url,
        {
          appliedFacets: {},
          limit: 20,
          offset: 0,
          searchText: 'developer'
        },
        { headers, timeout: 10000 }
      );

      const rawJobs = response.data?.jobPostings || [];
      const parsedJobs = rawJobs.map(job => {
        const locations = job.locationsText || job.bulletFields?.[0] || 'Unspecified';
        const isRemote =
          locations.toLowerCase().includes('remote') ||
          job.title.toLowerCase().includes('remote');

        // External direct link
        const directUrl = `https://${host}/en-US/${site}${job.externalPath}`;

        return {
          company: company.name,
          title: job.title || '',
          location: locations,
          url: directUrl,
          source: 'workday',
          tier: 'mnc',
          isRemote,
          snippet: `${job.title} at ${company.name} in ${locations}. Requisition: ${job.bulletFields?.join(' • ') || ''}`,
          postedAt: job.postedOn ? new Date().toISOString() : new Date().toISOString()
        };
      });

      return {
        modified: true,
        jobs: parsedJobs
      };
    } catch (err) {
      console.warn(`⚠️ [Workday] Error fetching ${company.name}:`, err.response?.status || err.message);
      return { modified: false, jobs: [] };
    }
  }
}

module.exports = new WorkdayScraper();
