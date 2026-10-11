const axios = require('axios');

class LeverScraper {
  /**
   * Fetches job openings for a company hosted on Lever
   */
  async fetchJobs(company) {
    const url = `https://api.lever.co/v0/postings/${company.token}?mode=json`;
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
      const rawPostings = Array.isArray(response.data) ? response.data : [];

      const parsedJobs = rawPostings.map(post => {
        const location = post.categories?.location || 'Unspecified';
        const commitment = post.categories?.commitment || '';
        const workplaceType = post.workplaceType || '';
        const isRemote =
          workplaceType.toLowerCase().includes('remote') ||
          location.toLowerCase().includes('remote');

        return {
          company: company.name,
          title: post.text || '',
          location,
          workplaceType,
          salaryData: post.salaryRange,
          url: post.hostedUrl || post.applyUrl,
          source: 'lever',
          tier: company.tier,
          isRemote,
          snippet: (post.descriptionPlain || ''),
          postedAt: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString()
        };
      });

      return {
        modified: true,
        etag: newEtag,
        jobs: parsedJobs
      };
    } catch (err) {
      if (err.response?.status === 404) {
        return { modified: false, jobs: [] };
      }
      console.warn(`⚠️ [Lever] Error fetching ${company.name}:`, err.message);
      return { modified: false, jobs: [] };
    }
  }
}

module.exports = new LeverScraper();
