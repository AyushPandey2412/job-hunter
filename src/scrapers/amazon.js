const axios = require('axios');
const cheerio = require('cheerio');

module.exports = {
  async fetchJobs(company) {
    const jobs = [];
    let total = 0;
    for (let offset = 0; offset < 5000; offset += 100) {
      const { data } = await axios.get('https://www.amazon.jobs/en/search.json', {
        params: { offset, result_limit: 100, country: 'IND', sort: 'recent' }, timeout: 20000
      });
      if (!Array.isArray(data?.jobs) || data.error) throw new Error('Amazon returned an invalid search response');
      total = Number(data.hits || 0);
      for (const job of data.jobs) {
        if (!job.title || !job.job_path) throw new Error('Amazon job metadata missing title or URL');
        const description = [job.description, job.basic_qualifications, job.preferred_qualifications].filter(Boolean).join(' ');
        const date = Date.parse(job.posted_date);
        jobs.push({ company: company.name, title: job.title,
          location: [job.city, 'India'].filter(Boolean).join(', '),
          url: new URL(job.job_path, 'https://www.amazon.jobs').href,
          source: 'amazon-jobs', tier: 'mnc',
          snippet: cheerio.load(description).text().replace(/\s+/g, ' ').trim(),
          requiredQualifications: require('./utils').text(job.basic_qualifications || job.description),
          preferredQualifications: require('./utils').text(job.preferred_qualifications),
          sourceJobId: String(job.id_icims || job.id), detailsComplete: true,
          availability: 'listed', verifiedAt: new Date().toISOString(),
          postedAt: Number.isFinite(date) ? new Date(date).toISOString() : null });
      }
      if (!data.jobs.length || offset + data.jobs.length >= total) break;
    }
    return { modified: true, jobs, totalAvailable: total, truncated: total > jobs.length };
  }
};
