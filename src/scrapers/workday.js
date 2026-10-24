const { axios, options, enrich, sections, listed } = require('./utils');
function indiaFacet(facets) {
  for (const facet of facets || []) {
    const india = (facet.values || []).find(value => value.descriptor === 'India');
    if (india && facet.facetParameter) return { [facet.facetParameter]: [india.id] };
    if (facet.descriptor === 'Locations' && facet.facetParameter) {
      const locations = (facet.values || []).filter(value => /\bIndia\b/i.test(value.descriptor));
      if (locations.length) return { [facet.facetParameter]: locations.map(value => value.id) };
    }
    const nested = indiaFacet(facet.values);
    if (nested) return nested;
  }
  return null;
}
module.exports = {
  async fetchJobs(company) {
    if (!company.workdayConfig) throw new Error('Workday host not configured');
    const { host, tenant, site } = company.workdayConfig;
    const base = 'https://' + host + '/wday/cxs/' + tenant + '/' + site;
    const jobs = [];
    let facets = {}, total = 0;
    for (let offset = 0; offset < 3000; offset += 20) {
      const { data } = await axios.post(base + '/jobs', { appliedFacets: facets, limit: 20, offset, searchText: '' }, options);
      if (!Array.isArray(data?.jobPostings)) throw new Error('Invalid Workday search response');
      if (offset === 0 && !Object.keys(facets).length) {
        const country = indiaFacet(data.facets);
        if (country) { facets = country; offset = -20; continue; }
      }
      if (Number.isFinite(data.total)) total = data.total;
      for (const row of data.jobPostings) {
        if (!row.externalPath || !row.title) continue;
        jobs.push({ company: company.name, title: row.title, location: row.locationsText || 'Unspecified',
          url: 'https://' + host + '/en-US/' + site + row.externalPath,
          sourceJobId: row.bulletFields?.[0] || row.externalPath, externalPath: row.externalPath,
          source: 'workday', tier: company.tier || 'mnc', snippet: '', detailsComplete: false,
          postedAt: null, ...listed() });
      }
      if (!data.jobPostings.length || offset + data.jobPostings.length >= total) break;
    }
    const result = await enrich(jobs, async job => {
      const { data } = await axios.get(base + job.externalPath, options);
      const info = data?.jobPostingInfo;
      if (!info?.jobDescription) throw new Error('Workday full requirements missing');
      return { ...sections(info.jobDescription),
        location: [info.location, ...(info.additionalLocations || [])].filter(Boolean).join('; ') || job.location,
        workplaceType: info.remoteType || '', sourceJobId: info.jobReqId || job.sourceJobId,
        postedAt: info.startDate || null };
    });
    return { modified: true, ...result, totalAvailable: total, truncated: jobs.length < total };
  }, indiaFacet
};
