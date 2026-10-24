const crypto = require('crypto');
function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|source$|src$|ref$|tracking|gh_src$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return String(value || '').trim(); }
}
function identity(job) {
  const url = canonicalUrl(job.url || job.job_url);
  let id = job.sourceJobId || job.source_job_id;
  if (!id) {
    try {
      const parsed = new URL(url);
      id = parsed.searchParams.get('jobId') || parsed.searchParams.get('gh_jid') ||
        parsed.pathname.match(/(?:\/jobs\/|\/job\/|\/results\/)(\d+)(?:[\/-]|$)/)?.[1] ||
        parsed.pathname.match(/_((?:JR|R)\d+)(?:[-/]|$)/i)?.[1];
    } catch {}
  }
  const company = String(job.company || job.company_name || '').trim().toLowerCase();
  const key = `${company}:${id ? String(id).toLowerCase() : url}`;
  return { sourceJobId: id ? String(id) : '', sourceJobKey: crypto.createHash('sha256').update(key).digest('hex'), url };
}
module.exports = { canonicalUrl, identity };
