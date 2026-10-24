const { axios, cheerio, options, enrich, sections, listed } = require('./utils');
const base = 'https://www.google.com/about/careers/applications/';
module.exports = {
  async fetchJobs(company) {
    const jobs = new Map();
    let hasNext = false;
    for (let page = 1; page <= 100; page++) {
      const { data } = await axios.get(`${base}jobs/results/`, { ...options, params: { location: 'India', page } });
      const $ = cheerio.load(data);
      const links = $('a').filter((_, el) => /^jobs\/results\/\d/.test($(el).attr('href') || ''));
      if (!links.length && !/no (?:matching )?jobs|0 jobs/i.test($.text())) throw new Error('Google job cards missing; search page may have changed');
      links.each((_, el) => {
        const card = $(el).closest('li');
        const url = new URL($(el).attr('href'), base); url.search = '';
        const title = card.find('h3').first().text().trim();
        const location = [...new Set(card.find('.r0wTof').map((_, el) => $(el).text().trim()).get())].join('; ');
        if (!title) return;
        jobs.set(url.href, { company: company.name, title, location, url: url.href,
          sourceJobId: url.pathname.match(/results\/(\d+)/)?.[1], source: 'google-careers', tier: 'mnc',
          ...sections(card.find('.Xsxa1e').html() || ''), detailsComplete: false, postedAt: null, ...listed() });
      });
      hasNext = $('a').toArray().some(el => {
        try { return new URL($(el).attr('href'), base).searchParams.get('page') === String(page + 1); } catch { return false; }
      });
      if (!hasNext) break;
    }
    const result = await enrich([...jobs.values()], async job => {
      const { data } = await axios.get(job.url, options);
      const $ = cheerio.load(data);
      const main = $('main');
      if (/job not found|no longer available/i.test(main.text())) return { availability: 'closed' };
      const required = $('h3,h4').filter((_, el) => /minimum qualifications/i.test($(el).text())).first();
      const preferred = $('h3,h4').filter((_, el) => /preferred qualifications/i.test($(el).text())).first();
      const body = main.length ? main.html() : '';
      if (!body || !required.length) throw new Error('Google full requirements missing');
      const result = sections(body);
      if (required.length) result.requiredQualifications = require('./utils').text(required.next('ul').html() || required.parent().html());
      if (preferred.length) result.preferredQualifications = require('./utils').text(preferred.next('ul').html() || '');
      return result;
    });
    return { modified: true, ...result, totalAvailable: jobs.size, truncated: hasNext };
  }
};
