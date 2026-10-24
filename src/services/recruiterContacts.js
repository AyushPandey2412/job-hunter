const axios = require('axios');
const companies = require('../config/companies');
const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
function domain(company) {
  const defaults = { IBM: 'ibm.com', Amazon: 'amazon.com', Nvidia: 'nvidia.com', Adobe: 'adobe.com', Intel: 'intel.com' };
  return companies.find(row => row.name === company)?.domain || defaults[company] || '';
}
function publicContacts(job) {
  const text = job.description_snippet || job.snippet || '';
  const results = new Map();
  for (const match of text.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi)) {
    const email = match[0].replace(/[.,;]+$/, '').toLowerCase();
    const context = text.slice(Math.max(0, match.index - 130), match.index + email.length + 100);
    if (!emailPattern.test(email) || /accommodat|accessib|privacy|disabilit|noreply|no-reply|support@|legal@|security@/i.test(email + ' ' + context)) continue;
    if (!/recruit|hiring|talent|resume|résumé|apply|application|careers|contact.*hr/i.test(context)) continue;
    results.set(email, { email, name: '', sourceUrl: job.job_url || job.url, provenance: 'published-in-listing', verification: 'unverified', jobSpecific: true });
  }
  return [...results.values()];
}
function searches(job) {
  const company = job.company_name || job.company;
  const query = `${company} technical recruiter talent acquisition India`;
  return { linkedin: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`,
    web: `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${company}" recruiter India`)}` };
}
async function hunter(job) {
  if (!process.env.HUNTER_API_KEY) throw new Error('Set HUNTER_API_KEY on the server to enable public work-email lookup');
  const companyDomain = domain(job.company_name || job.company);
  if (!companyDomain) throw new Error('No verified company domain configured');
  try {
    const { data } = await axios.get('https://api.hunter.io/v2/domain-search', { params: {
      domain: companyDomain, department: 'hr', limit: 10, api_key: process.env.HUNTER_API_KEY
    }, timeout: 15000 });
    return (data.data?.emails || []).filter(contact => contact.sources?.length && emailPattern.test(contact.value)).map(contact => ({
      name: [contact.first_name, contact.last_name].filter(Boolean).join(' '), email: contact.value.toLowerCase(),
      sourceUrl: contact.sources[0].uri, provenance: 'hunter-public-source',
      verification: contact.verification?.status || 'unverified', jobSpecific: false,
      position: contact.position || 'HR contact; assignment to this vacancy not confirmed'
    }));
  } catch { throw new Error('Contact lookup failed. Check Hunter credentials, quota and connectivity.'); }
}
module.exports = { emailPattern, domain, publicContacts, searches, hunter };
