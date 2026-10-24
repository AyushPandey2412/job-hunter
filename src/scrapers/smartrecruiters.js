const { axios, options, enrich, sections, listed } = require('./utils');
module.exports = {
  async fetchJobs(company) {
    const jobs = [];
    let total = 0;
    const base = 'https://api.smartrecruiters.com/v1/companies/' + encodeURIComponent(company.token) + '/postings';
    for (let offset = 0; offset < 5000; offset += 100) {
      const { data } = await axios.get(base, { ...options, params: { limit: 100, offset, country: 'in' } });
      if (!Array.isArray(data?.content)) throw new Error('Invalid SmartRecruiters search response');
      total = Number(data.totalFound || 0);
      for (const row of data.content) jobs.push({ company: company.name, title: row.name,
        location: [row.location?.city, row.location?.country].filter(Boolean).join(', '),
        url: 'https://jobs.smartrecruiters.com/' + company.token + '/' + row.id,
        sourceJobId: String(row.id), source: 'smartrecruiters', tier: company.tier || 'mnc',
        isRemote: !!row.location?.remote, snippet: '', detailsComplete: false,
        postedAt: row.releasedDate || null, ...listed() });
      if (!data.content.length || offset + data.content.length >= total) break;
    }
    const result = await enrich(jobs, async job => {
      const { data } = await axios.get(base + '/' + encodeURIComponent(job.sourceJobId), options);
      const content = data?.jobAd?.sections;
      if (!content) throw new Error('SmartRecruiters full requirements missing');
      const result = sections(Object.values(content).map(s => (s.title || '') + '\n' + (s.text || '')).join('\n'));
      if (content.qualifications?.text) result.requiredQualifications = sections(content.qualifications.text).requiredQualifications;
      return result;
    });
    return { modified: true, ...result, totalAvailable: total, truncated: jobs.length < total };
  }
};
