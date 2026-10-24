const axios = require('axios');
const cheerio = require('cheerio');

class EnterpriseIndiaScraper {
  /**
   * Fetches real-time 0-3 years experience developer jobs for
   * Indian & Global giants (TCS, Accenture, Tata Motors, Infosys, Wipro, Cognizant, HCL).
   * Rotates key hub locations: Bengaluru, Mumbai, Hyderabad, Noida/Delhi NCR.
   * Uses clean HTTP guest feeds with strict level parameter f_E=1,2,3 (Internship, Entry Level 0-2 yrs, Associate 1-3 yrs).
   */
  async fetchJobs(company) {
    const configured = require('../config').filters.targetLocations.filter(city => city !== 'remote');
    const locationsToScan = configured.length ? configured : ['India'];
    const chosenLoc = locationsToScan[Math.floor(Math.random() * locationsToScan.length)];
    const query = `${company.name} developer`;

    // f_E=1,2,3 filters specifically for: Internship, Entry Level (0-2 Yrs), Associate (1-3 Yrs)
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(chosenLoc)}&f_E=1%2C2%2C3&start=0`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 12000
      });

      const $ = cheerio.load(response.data);
      const parsedJobs = [];

      $('li').each((i, item) => {
        const title = $(item).find('h3.base-search-card__title').text().trim();
        const companyName = $(item).find('h4.base-search-card__subtitle').text().trim();
        const aliases = { tcs: /\btcs\b|tata consultancy services/i, accenture: /accenture/i, infosys: /infosys/i, wipro: /wipro/i };
        const companyMatches = aliases[company.token] ? aliases[company.token].test(companyName) : companyName.toLowerCase().includes(company.name.toLowerCase());
        const location = $(item).find('span.job-search-card__location').text().trim() || chosenLoc;
        const rawLink = $(item).find('a.base-card__full-link').attr('href') || '';
        const cleanLink = rawLink.split('?')[0];

        const isRemote =
          location.toLowerCase().includes('remote') ||
          title.toLowerCase().includes('remote');

        if (title && cleanLink && companyMatches) {
          parsedJobs.push({
            company: company.name,
            title,
            location,
            url: cleanLink,
            source: 'linkedin-guest',
            tier: 'mnc',
            isRemote,
            snippet: `${title} at ${companyName} (${location}).`,
            postedAt: $(item).find('time').attr('datetime') || null
          });
        }
      });

      return {
        modified: true,
        jobs: parsedJobs
      };
    } catch (err) {
      console.warn(`⚠️ [Enterprise India] Error fetching ${company.name} (${chosenLoc}):`, err.message);
      return { modified: false, jobs: [], error: err.message };
    }
  }
}

module.exports = new EnterpriseIndiaScraper();
