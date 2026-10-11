const axios = require('axios');

class SmartRecruitersScraper {
  /**
   * Fetches job openings for SmartRecruiters public API
   */
  async fetchJobs(company) {
    const url = `https://api.smartrecruiters.com/v1/companies/${company.token}/postings?limit=30`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const rawContent = response.data?.content || [];
      const parsedJobs = rawContent.map(job => {
        const locationCity = job.location?.city || '';
        const locationCountry = job.location?.country || '';
        const locationStr = [locationCity, locationCountry].filter(Boolean).join(', ') || 'Unspecified';
        const isRemote =
          !!job.location?.remote ||
          locationStr.toLowerCase().includes('remote') ||
          job.name.toLowerCase().includes('remote');

        const directUrl = `https://jobs.smartrecruiters.com/${company.token}/${job.id}`;

        return {
          company: company.name,
          title: job.name || '',
          location: locationStr,
          url: directUrl,
          source: 'smartrecruiters',
          tier: 'mnc',
          isRemote,
          snippet: `${job.name} at ${company.name}. Type: ${job.typeOfEmployment?.label || 'Full-time'}. Department: ${job.department?.label || 'Engineering'}`,
          postedAt: job.releasedDate || new Date().toISOString()
        };
      });

      return {
        modified: true,
        jobs: parsedJobs
      };
    } catch (err) {
      console.warn(`⚠️ [SmartRecruiters] Error fetching ${company.name}:`, err.message);
      return { modified: false, jobs: [] };
    }
  }
}

module.exports = new SmartRecruitersScraper();
