const axios = require('axios');
const cheerio = require('cheerio');

async function testFeeds2() {
  console.log('Testing Indeed alternate RSS and Wellfound GraphQL/API...\n');

  // 1. Indeed Global/India RSS
  const indeedUrls = [
    'https://rss.indeed.com/rss?q=react+developer&l=India&fromage=1',
    'https://www.indeed.com/rss?q=remote+react+developer&fromage=1'
  ];

  for (const url of indeedUrls) {
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 8000
      });
      const $ = cheerio.load(res.data, { xmlMode: true });
      const items = [];
      $('item').each((i, item) => {
        const title = $(item).find('title').text().trim();
        const link = $(item).find('link').text().trim();
        const source = $(item).find('source').text().trim();
        if (title) items.push({ title, link, source });
      });
      console.log(`✅ [Indeed RSS: ${url}] Found ${items.length} jobs.`);
      if (items.length > 0) {
        console.log(`   Sample: "${items[0].title}" @ ${items[0].source}`);
      }
    } catch (e) {
      console.log(`❌ Indeed URL ${url} Error:`, e.message);
    }
  }

  // 2. Instahyre public job search page
  try {
    const res = await axios.get('https://www.instahyre.com/software-engineer-jobs-in-bangalore', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });
    const $ = cheerio.load(res.data);
    const jobs = [];
    $('.employer-row').each((i, item) => {
      const title = $(item).find('.employer-job-name').text().trim();
      const comp = $(item).find('.employer-name').text().trim();
      const loc = $(item).find('.employer-locations').text().trim();
      const link = $(item).find('a').attr('href');
      if (title) jobs.push({ title, comp, loc, link });
    });
    console.log(`✅ [Instahyre HTML] Found ${jobs.length} jobs.`);
    if (jobs.length > 0) {
      console.log(`   Sample: "${jobs[0].title}" @ ${jobs[0].comp} (${jobs[0].loc})`);
    }
  } catch (e) {
    console.log('❌ Instahyre Error:', e.message);
  }
}

testFeeds2();
