function details(job) {
  const text = `${job.workplaceType || ''} ${job.location || ''} ${job.title || ''}`;
  const workMode = /\bhybrid\b/i.test(text) ? 'hybrid' : (job.isRemote || /\bremote\b|work from home/i.test(text)) ? 'remote' : /on[- ]?site|in[- ]office/i.test(text) ? 'onsite' : 'unknown';
  const raw = job.salaryData || {};
  const amount = value => value == null || value === '' ? NaN : Number(value);
  let min = amount(raw.min ?? raw.minValue), max = amount(raw.max ?? raw.maxValue);
  let currency = String(raw.currency || '').toUpperCase();
  let period = String(raw.interval || raw.period || '').toLowerCase();
  period = /year|annual/.test(period) ? 'year' : /month/.test(period) ? 'month' : /hour/.test(period) ? 'hour' : '';
  const salary = job.salary || '';
  const salaryText = `${salary} ${job.snippet || ''}`;
  const lpa = salaryText.match(/(?:₹|INR|Rs\.?\s*)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:LPA|lakhs? per annum)/i);
  if (lpa && !Number.isFinite(min)) { min = Number(lpa[1]) * 100000; max = Number(lpa[2]) * 100000; currency = 'INR'; period = 'year'; }
  const range = salaryText.match(/\b(INR|USD|GBP|EUR)\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*(?:INR|USD|GBP|EUR)?\s*([\d,]+(?:\.\d+)?)\s*(?:\/|per\s+)(year|annum|month|hour)\b/i);
  if (range && !Number.isFinite(min)) { min = Number(range[2].replace(/,/g, '')); max = Number(range[3].replace(/,/g, '')); currency = range[1].toUpperCase(); period = range[4].toLowerCase() === 'annum' ? 'year' : range[4].toLowerCase(); }
  const known = Number.isFinite(min) && min >= 0 && Number.isFinite(max) && max >= min && currency && period;
  const region = `${job.location || ''} ${job.remoteRegion || ''}`;
  const remoteEligibility = workMode !== 'remote' ? 'not-applicable' : /worldwide|anywhere|global/i.test(region) ? 'worldwide' : /\bindia\b|mumbai|bengaluru|bangalore|pune|delhi|hyderabad|chennai|noida|gurugram/i.test(region) ? 'india' : /united states|\busa?\b|united kingdom|\buk\b|canada|europe|germany|australia|singapore/i.test(region) ? 'restricted' : 'unknown';
  return { workMode, remoteEligibility, salaryMin: known ? min : null, salaryMax: known ? max : null, salaryCurrency: known ? currency : '', salaryPeriod: known ? period : '', salary: known ? `${currency} ${min.toLocaleString('en-US')}–${max.toLocaleString('en-US')} / ${period}` : salary || 'Not specified' };
}
module.exports = details;
