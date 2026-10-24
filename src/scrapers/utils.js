const axios = require('axios');
const cheerio = require('cheerio');
const cache = new Map();
const headers = { 'User-Agent': 'JobHunter/1.0 (personal job discovery)', Accept: 'application/json,text/html' };
const options = { timeout: 20000, headers };
function text(html) {
  const $ = cheerio.load(String(html || ''));
  $('script,style').remove();
  $('br').replaceWith('\n');
  $('p,li,h1,h2,h3,h4,b,strong').each((_, el) => { $(el).append('\n'); });
  return $.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}
function sections(html) {
  const plain = text(html);
  const preferred = /(?:preferred(?:\/additional)? qualifications|preferred experience|nice[- ]to[- ]have|desirable skills|desired qualifications)\s*:?/i.exec(plain);
  if (!preferred) return { snippet: plain, requiredQualifications: plain, preferredQualifications: '' };
  const before = plain.slice(0, preferred.index);
  const after = plain.slice(preferred.index + preferred[0].length);
  const end = /\n\s*(?:responsibilities|about (?:us|the team)|benefits|equal opportunity|how to apply)\b/i.exec(after);
  return { snippet: plain, requiredQualifications: before, preferredQualifications: end ? after.slice(0, end.index) : after };
}
function relevant(title) {
  return /software|developer|engineer|full.?stack|front.?end|back.?end|\bsde\b|intern|apprentice/i.test(title || '') &&
    require('../services/filterService').checkExperience(title || '', '').allowed;
}
async function enrich(jobs, loader) {
  const warnings = [];
  const candidates = jobs.filter(job => relevant(job.title));
  const limit = Math.max(1, Math.min(1000, Number(process.env.JOB_DETAIL_LIMIT) || 300));
  if (candidates.length > limit) warnings.push(`Full-detail limit reached: ${limit}/${candidates.length} candidate roles. Remaining roles need review.`);
  let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < Math.min(candidates.length, limit)) {
      const job = candidates[cursor++];
      try {
        const cached = cache.get(job.url);
        const detail = cached && Date.now() - cached.at < 6 * 3600000 ? cached.data : await loader(job);
        if (cache.size > 5000) cache.delete(cache.keys().next().value);
        cache.set(job.url, { at: Date.now(), data: detail });
        Object.assign(job, detail, { detailsComplete: true });
      } catch (error) {
        if ([404, 410].includes(error.response?.status)) job.availability = 'closed';
        else warnings.push(`Job ${job.sourceJobId || job.title}: details unavailable (${error.response?.status || error.code || 'request failed'})`);
      }
    }
  }));
  return { jobs: jobs.filter(job => job.availability !== 'closed'), warnings };
}
const listed = () => ({ availability: 'listed', verifiedAt: new Date().toISOString() });
module.exports = { axios, cheerio, options, text, sections, relevant, enrich, listed };
