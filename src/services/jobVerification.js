const axios = require('axios');
const service = require('../db/database');
const { text } = require('../scrapers/utils');
const allowed = /(^|\.)(?:ibm\.com|ibmglobal\.avature\.net|amazon\.jobs|microsoft\.com|google\.com|oracle\.com|sap\.com|myworkdayjobs\.com|smartrecruiters\.com|greenhouse\.io|lever\.co|ashbyhq\.com|linkedin\.com|instahyre\.com)$/i;
function safeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !allowed.test(url.hostname)) throw new Error('Link verification is available for supported employer and ATS domains');
  return url;
}
async function verify(job) {
  let url = safeUrl(job.job_url || job.url);
  let state = 'unknown';
  for (let redirects = 0; redirects <= 3; redirects++) {
    try {
      const response = await axios.get(url.href, { timeout: 15000, maxRedirects: 0, maxContentLength: 5 * 1024 * 1024,
        validateStatus: status => status < 600, headers: { 'User-Agent': 'JobHunter/1.0' } });
      if ([301,302,303,307,308].includes(response.status)) { url = safeUrl(new URL(response.headers.location, url).href); continue; }
      const body = text(response.data);
      if ([404,410].includes(response.status) || /position (?:has been|is) filled|job (?:is )?no longer available|job (?:not found|has expired)|no longer accepting applications/i.test(body)) state = 'closed';
      else if (response.status === 200 && !/captcha|verify you are human|access denied/i.test(body) && body.toLowerCase().includes(job.title.toLowerCase())) state = 'reachable';
      break;
    } catch { break; }
  }
  const verifiedAt = new Date().toISOString();
  await service.db.prepare('UPDATE jobs SET availability=?, verified_at=? WHERE id=?').run(state, verifiedAt, job.id);
  return { availability: state, verifiedAt };
}
module.exports = { verify, safeUrl };
