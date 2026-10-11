const axios = require('axios');
const cheerio = require('cheerio');

async function testLinkedIn() {
  console.log('Testing LinkedIn Guest API for TCS, Accenture, Tata Motors, Infosys...\n');
  const companies = ['TCS', 'Accenture', 'Tata Motors', 'Infosys'];

  for (const c of companies) {
    try {
      // f_E=1,2,3 corresponds strictly to: Internship, Entry Level (0-2 Yrs), Associate (1-3 Yrs)
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(c + ' developer')}&location=India&f_E=1%2C2%2C3&start=0`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 10000
      });

      const $ = cheerio.load(res.data);
      const jobs = [];
      $('li').each((i, item) => {
        const title = $(item).find('h3.base-search-card__title').text().trim();
        const comp = $(item).find('h4.base-search-card__subtitle').text().trim();
        const loc = $(item).find('span.job-search-card__location').text().trim();
        const link = $(item).find('a.base-card__full-link').attr('href');
        if (title && link) {
          jobs.push({ title, comp, loc, link });
        }
      });

      console.log(`✅ [${c}] Found: ${jobs.length} early-career roles (0-3 yrs).`);
      if (jobs.length > 0) {
        console.log(`   Sample: "${jobs[0].title}" @ ${jobs[0].comp} (${jobs[0].loc})`);
        console.log(`   URL: ${jobs[0].link.split('?')[0]}`);
      }
    } catch (e) {
      console.log(`❌ Error for ${c}:`, e.message);
    }
  }
}

testLinkedIn();
