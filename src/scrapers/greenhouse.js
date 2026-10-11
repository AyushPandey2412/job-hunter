const axios = require('axios');
const cheerio = require('cheerio');

class GreenhouseScraper {
  /**
   * Fetches job openings for a company hosted on Greenhouse
   */
  async fetchJobs(company) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${company.token}/jobs?content=true`;
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

      // 304 Not Modified: Nothing new, exit in 50ms!
      if (response.status === 304) {
        return { modified: false, jobs: [] };
      }

      const newEtag = response.headers['etag'] || null;
      const rawJobs = response.data?.jobs || [];

      const parsedJobs = rawJobs.map(job => {
        // Strip HTML from content snippet
        let snippet = '';
        if (job.content) {
          const $ = cheerio.load(job.content);
          snippet = $.text().replace(/\s+/g, ' ').trim();
        }

        return {
          company: company.name,
          title: job.title || '',
          location: job.location?.name || 'Unspecified',
          url: job.absolute_url,
          source: 'greenhouse',
          tier: company.tier,
          snippet,
          postedAt: job.updated_at || new Date().toISOString()
        };
      });

      return {
        modified: true,
        etag: newEtag,
        jobs: parsedJobs
      };
    } catch (err) {
      if (err.response?.status === 404) {
        // Board token might have changed or private
        return { modified: false, jobs: [] };
      }
      console.warn(`⚠️ [Greenhouse] Error fetching ${company.name}:`, err.message);
      return { modified: false, jobs: [] };
    }
  }
}

module.exports = new GreenhouseScraper();
