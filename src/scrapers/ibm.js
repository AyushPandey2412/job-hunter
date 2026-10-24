const axios = require('axios');

module.exports = {
  async fetchJobs(company) {
    const jobs = [];
    let total = 0;
    for (let from = 0; from < 5000; from += 100) {
      const { data } = await axios.post('https://www-api.ibm.com/search/api/v2', {
        appId: 'careers', scopes: ['careers2'], from, size: 100,
        query: { bool: { must: [{ match: { field_keyword_05: 'India' } }] } },
        sort: [{ dcdate: 'desc' }, { _id: 'asc' }],
        _source: ['title', 'url', 'body', 'description', 'dcdate', 'field_keyword_05', 'field_keyword_08', 'field_keyword_17', 'field_keyword_18', 'field_keyword_19']
      }, { timeout: 20000 });
      if (!Array.isArray(data?.hits?.hits) || data.timed_out || data._shards?.failed) throw new Error('IBM returned an incomplete or invalid search response');
      total = Number(data.hits.total?.value ?? data.hits.total ?? 0);
      const page = data.hits.hits;
      for (const hit of page) {
        const job = hit._source;
        if (!job?.title || !job.url) throw new Error('IBM job metadata missing title or URL');
        jobs.push({ company: company.name, title: job.title,
          location: [job.field_keyword_19, job.field_keyword_05].filter(Boolean).join(', '),
          url: job.url, source: 'ibm-careers', tier: 'mnc',
          workplaceType: job.field_keyword_17 || '',
          snippet: [job.field_keyword_18, job.body || job.description].filter(Boolean).join('. '),
          requiredQualifications: require('./utils').sections(job.body || job.description).requiredQualifications,
          preferredQualifications: require('./utils').sections(job.body || job.description).preferredQualifications,
          detailsComplete: !!job.body, availability: 'listed', verifiedAt: new Date().toISOString(),
          postedAt: job.dcdate || null });
      }
      if (!page.length || from + page.length >= total) break;
    }
    return { modified: true, jobs, totalAvailable: total, truncated: total > jobs.length };
  }
};
