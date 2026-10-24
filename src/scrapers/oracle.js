const { axios, options, enrich, sections, listed } = require('./utils');
const base = 'https://eeho.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/';
module.exports = {
  async fetchJobs(company) {
    const jobs = [];
    let total = 0, checked = 0;
    // Country search facets omit some city postings. Read the complete feed and check country metadata.
    for (let offset = 0; offset < 5000; offset += 25) {
      const { data } = await axios.get(`${base}recruitingCEJobRequisitions`, { ...options, params: {
        onlyData: true, expand: 'requisitionList',
        finder: `findReqs;siteNumber=CX_45001,limit=25,offset=${offset},sortBy=POSTING_DATES_DESC`
      } });
      const result = data?.items?.[0];
      if (!Array.isArray(result?.requisitionList)) throw new Error('Invalid Oracle search response');
      total = Number(result.TotalJobsCount || 0);
      const page = result.requisitionList; checked += page.length;
      for (const row of page) {
        if (row.PrimaryLocationCountry !== 'IN') continue;
        jobs.push({ company: company.name, title: row.Title, location: row.PrimaryLocation,
          sourceJobId: String(row.Id), url: `https://careers.oracle.com/en/sites/jobsearch/job/${row.Id}`,
          source: 'oracle-careers', tier: 'mnc', snippet: row.ShortDescriptionStr || '', detailsComplete: false,
          postedAt: row.PostedDate || null, ...listed() });
      }
      if (!page.length || checked >= total) break;
    }
    const result = await enrich(jobs, async job => {
      const { data } = await axios.get(`${base}recruitingCEJobRequisitionDetails`, { ...options, params: {
        onlyData: true, expand: 'all', finder: `ById;Id=${job.sourceJobId}`
      } });
      const row = data?.items?.[0];
      if (!row?.ExternalDescriptionStr) throw new Error('Oracle full requirements missing');
      return sections([row.ExternalDescriptionStr, row.ExternalQualificationsStr, row.ExternalResponsibilitiesStr].filter(Boolean).join('\n'));
    });
    return { modified: true, ...result, totalAvailable: jobs.length, totalSourceListings: total, truncated: checked < total };
  }
};
