const axios = require('axios');
const cheerio = require('cheerio');

class IndeedRssScraper {
  /**
   * Fetches latest developer jobs from Indeed public RSS feeds.
   * Gracefully handles 429 rate limits without blocking other scrapers.
   */
  async fetchJobs() {
    const warnings = [];
    const jobs = [];
    const feedUrls = [
      'https://in.indeed.com/rss?q=react+developer&l=India',
      'https://in.indeed.com/rss?q=node+developer&l=Bangalore',
      'https://www.indeed.com/rss?q=junior+developer+remote'
    ];

    for (const url of feedUrls) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9'
          },
          timeout: 6000
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        $('item').each((i, item) => {
          const title = $(item).find('title').text().trim();
          const link = $(item).find('link').text().trim();
          const source = $(item).find('source').text().trim() || 'Indeed Employer';
          const description = $(item).find('description').text().trim();
          const pubDate = $(item).find('pubDate').text().trim();

          if (title && link) {
            const isRemote =
              title.toLowerCase().includes('remote') ||
              description.toLowerCase().includes('remote');

            jobs.push({
              company: source,
              title,
              location: isRemote ? 'Remote' : 'India',
              url: link,
              source: 'indeed-rss',
              tier: 'mnc',
              isRemote,
              snippet: `${title} at ${source}. ${description.slice(0, 150)}...`,
              postedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
            });
          }
        });
      } catch (err) {
          warnings.push(err.message);
        // Expected 429 or 403 on cloudflare/rate-limited environments
        // Silently skip so Instahyre and Direct ATS continue seamlessly
        continue;
      }
    }

    return {
      modified: true,
      warnings,
      jobs
    };
  }
}

module.exports = new IndeedRssScraper();
