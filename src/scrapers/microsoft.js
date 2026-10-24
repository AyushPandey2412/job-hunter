const { axios, options, enrich, sections, listed } = require('./utils');
module.exports = {
  async fetchJobs(company) {
    const jobs = [];
    let total = 0;
    for (let start = 0; start < 3000;) {
      const { data } = await axios.get('https://apply.careers.microsoft.com/api/pcsx/search', {
        ...options, params: { domain: 'microsoft.com', query: '', location: 'India', start }
      });
      const page = data?.data?.positions;
      if (!Array.isArray(page) || data.error?.message) throw new Error('Invalid Microsoft search response');
      total = Number(data.data.count || 0);
      for (const row of page) jobs.push({ company: company.name, title: row.name,
        sourceJobId: String(row.id), location: (row.locations || []).join('; '),
        url: `https://apply.careers.microsoft.com/careers/job/${row.id}`,
        workplaceType: row.workLocationOption, source: 'microsoft-careers', tier: 'mnc',
        snippet: '', detailsComplete: false,
        postedAt: row.postedTs ? new Date(row.postedTs * 1000).toISOString() : null, ...listed() });
      if (!page.length || start + page.length >= total) break;
      start += page.length;
    }
    const result = await enrich(jobs, async job => {
      const { data } = await axios.get('https://apply.careers.microsoft.com/api/pcsx/position_details', {
        ...options, params: { domain: 'microsoft.com', position_id: job.sourceJobId }
      });
      if (!data?.data?.jobDescription) throw new Error('Missing Microsoft requirements');
      return { ...sections(data.data.jobDescription), workplaceType: data.data.efcustomTextWorkSite || data.data.workLocationOption };
    });
    return { modified: true, ...result, totalAvailable: total, truncated: jobs.length < total };
  }
};
