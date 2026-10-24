const service = require('../db/database');
const crypto = require('crypto');
const contacts = require('./recruiterContacts');
const ready = service.ready.then(() => service.db.exec(`
  CREATE TABLE IF NOT EXISTS outreach_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, email TEXT NOT NULL,
    contact_name TEXT DEFAULT '', source_url TEXT NOT NULL, verification TEXT DEFAULT 'unverified',
    subject TEXT NOT NULL, body TEXT NOT NULL, state TEXT DEFAULT 'draft',
    message_id TEXT NOT NULL, error TEXT, created_at TEXT DEFAULT (datetime('now')),
    approved_at TEXT, sent_at TEXT, UNIQUE(job_id,email), FOREIGN KEY(job_id) REFERENCES jobs(id)
  );
`));
function configured() { return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.OUTREACH_FROM); }
function profile() { return { name: process.env.CANDIDATE_NAME || '', summary: process.env.CANDIDATE_SUMMARY || '', portfolio: process.env.CANDIDATE_PORTFOLIO || '' }; }
function template(job, contact = {}) {
  const candidate = profile();
  return { subject: `Regarding ${job.title} at ${job.company_name}`,
    body: `Hi ${contact.name || 'Hiring Team'},\n\nI’m interested in the ${job.title} opening at ${job.company_name}${job.source_job_id ? ` (job ID ${job.source_job_id})` : ''}.\n${candidate.summary ? `\n${candidate.summary}\n` : ''}\nAre you handling this opening, or could you point me to the relevant recruiter?\n\nJob: ${job.job_url}${candidate.portfolio ? `\nPortfolio: ${candidate.portfolio}` : ''}\n\nThank you,\n${candidate.name || '[Your name]'}` };
}
async function getJob(id) {
  await ready;
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new Error('Invalid job ID');
  const job = await service.db.prepare('SELECT * FROM jobs WHERE id=?').get(Number(id));
  if (!job) throw new Error('Job not found');
  return job;
}
async function save(jobId, input) {
  const job = await getJob(jobId);
  const email = String(input.email || '').trim().toLowerCase();
  if (!contacts.emailPattern.test(email) || /[\r\n]/.test(email)) throw new Error('Enter one valid recruiter work email');
  let source;
  try { source = new URL(input.sourceUrl); } catch { throw new Error('Add the public contact source URL'); }
  if (!['https:', 'http:'].includes(source.protocol) || source.username || source.password) throw new Error('Invalid contact source URL');
  const subject = String(input.subject || '').trim(), body = String(input.body || '').trim();
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject) || !body || body.length > 10000) throw new Error('Invalid subject or message');
  if (/\[(?:Your name|Portfolio link|Name)\]/i.test(body)) throw new Error('Replace the template placeholders before saving');
  const messageId = `<${crypto.randomUUID()}@jobhunter.local>`;
  // Editing a draft revokes its approval. Sent and in-flight messages cannot be edited or re-sent.
  await service.db.prepare(`INSERT INTO outreach_drafts (job_id,email,contact_name,source_url,subject,body,message_id)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(job_id,email) DO UPDATE SET
    contact_name=excluded.contact_name,source_url=excluded.source_url,subject=excluded.subject,body=excluded.body,
    state='draft',approved_at=NULL,error=NULL WHERE outreach_drafts.state IN ('draft','approved','failed')`).run(
    job.id, email, String(input.name || '').slice(0,100), source.href, subject, body, messageId);
  return service.db.prepare('SELECT * FROM outreach_drafts WHERE job_id=? AND email=?').get(job.id,email);
}
async function approve(id, expected) {
  await ready;
  // Approval is bound to the exact recipient and message the user reviewed.
  const result = await service.db.prepare(`UPDATE outreach_drafts SET state='approved',approved_at=datetime('now')
    WHERE id=? AND state='draft' AND email=? AND subject=? AND body=?`).run(id, expected.email, expected.subject, expected.body);
  if (!result.changes) throw new Error('Draft changed or cannot be approved. Reload and review it.');
  return service.db.prepare('SELECT * FROM outreach_drafts WHERE id=?').get(id);
}
let busy = false;
async function send(id) {
  await ready;
  if (!configured()) throw new Error('Configure SMTP_HOST, SMTP_USER, SMTP_PASS and OUTREACH_FROM on the server');
  if (busy) throw new Error('Another email is sending; try again shortly');
  busy = true;
  let claimed = false;
  try {
    const draft = await service.db.prepare('SELECT * FROM outreach_drafts WHERE id=?').get(id);
    if (!draft || draft.state !== 'approved') throw new Error('Review and approve the draft first');
    const job = await getJob(draft.job_id);
    if (job.availability === 'closed') throw new Error('This opening is marked closed');
    const recent = await service.db.prepare("SELECT COUNT(*) AS count FROM outreach_drafts WHERE state IN ('sending','sent','uncertain') AND COALESCE(sent_at,approved_at) >= datetime('now','-1 day')").get();
    const max = Math.max(1, Math.min(100, Number(process.env.OUTREACH_DAILY_LIMIT) || 10));
    if (recent.count >= max) throw new Error('Daily outreach limit reached');
    const claim = await service.db.prepare("UPDATE outreach_drafts SET state='sending',error=NULL WHERE id=? AND state='approved'").run(id);
    if (!claim.changes) throw new Error('Message already claimed');
    claimed = true;
    const port = Number(process.env.SMTP_PORT) || 587;
    const transport = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      disableFileAccess: true, disableUrlAccess: true
    });
    let info;
    try { info = await transport.sendMail({ from: process.env.OUTREACH_FROM, to: draft.email,
      subject: draft.subject, text: draft.body, messageId: draft.message_id }); }
    finally { transport.close(); }
    if (!info.accepted?.length) throw new Error('Email server did not accept the recipient');
    await service.db.prepare("UPDATE outreach_drafts SET state='sent',sent_at=datetime('now'),error=NULL WHERE id=?").run(id);
    return { state: 'sent', messageId: draft.message_id };
  } catch (error) {
    if (claimed) {
      // A timeout can occur after SMTP accepted mail: never retry an uncertain delivery automatically.
      const definite = error.code === 'EAUTH' || [550,551,552,553,554].includes(error.responseCode);
      await service.db.prepare('UPDATE outreach_drafts SET state=?,error=? WHERE id=?').run(definite ? 'failed' : 'uncertain',
        definite ? 'Email server rejected the message. Check credentials or recipient.' : 'Delivery status uncertain. Check Sent mail before taking further action.', id);
      throw new Error(definite ? 'Email server rejected the message' : 'Delivery status uncertain; check Sent mail');
    }
    throw error;
  } finally { busy = false; }
}
async function drainApproved() {
  if (process.env.OUTREACH_AUTO_SEND !== 'true' || !configured() || busy) return;
  await ready;
  const draft = await service.db.prepare("SELECT id FROM outreach_drafts WHERE state='approved' ORDER BY approved_at,id LIMIT 1").get();
  if (draft) { try { await send(draft.id); } catch (error) { console.warn('[Outreach]', error.message); } }
}
async function list(jobId) { await ready; return service.db.prepare('SELECT * FROM outreach_drafts WHERE job_id=? ORDER BY id DESC').all(jobId); }
module.exports = { ready, configured, template, getJob, save, approve, send, drainApproved, list, profile };
