const { axios, cheerio, options, enrich, sections, listed } = require('./utils');
const base = 'https://careers.sap.com';
module.exports = {
  async fetchJobs(company) {
    const jobs = new Map();
    let hasNext = false;
    for (let startrow = 0; startrow < 3000; startrow += 25) {
      const { data } = await axios.get(`${base}/search/`, { ...options, params: { q: '', locationsearch: 'India', startrow } });
      const $ = cheerio.load(data);
      const links = $('a.jobTitle-link');
      if (!links.length && !/no jobs|no results/i.test($.text())) throw new Error('SAP job cards missing');
      links.each((_, el) => {
        const url = new URL($(el).attr('href'), base);
        const row = $(el).closest('tr');
        jobs.set(url.href, { company: company.name, title: $(el).text().trim(), url: url.href,
          location: row.find('.jobLocation').first().text().trim() || row.find('.colLocation').first().text().trim(),
          sourceJobId: url.pathname.match(/\/(\d+)\/?$/)?.[1], source: 'sap-careers', tier: 'mnc',
          snippet: '', detailsComplete: false, postedAt: null, ...listed() });
      });
      hasNext = $('a').toArray().some(el => {
        try { return new URL($(el).attr('href'), base).searchParams.get('startrow') === String(startrow + 25); } catch { return false; }
      });
      if (!hasNext) break;
    }
    const result = await enrich([...jobs.values()], async job => {
      const { data } = await axios.get(job.url, options);
      const $ = cheerio.load(data);
      const description = $('.jobdescription').first();
      if (!description.length) throw new Error('SAP full requirements missing');
      return sections(description.html());
    });
    return { modified: true, ...result, totalAvailable: jobs.size, truncated: hasNext };
  }
};
