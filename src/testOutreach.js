const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('./config'); config.dbPath = ':memory:';
const db = require('./db/database');
const outreach = require('./services/outreach');
const contacts = require('./services/recruiterContacts');
const nodemailer = require('nodemailer');
const originalTransport = nodemailer.createTransport;
const envKeys = ['SMTP_HOST','SMTP_USER','SMTP_PASS','OUTREACH_FROM','OUTREACH_AUTO_SEND','OUTREACH_DAILY_LIMIT'];
const oldEnv = Object.fromEntries(envKeys.map(key => [key,process.env[key]]));
after(() => { nodemailer.createTransport=originalTransport; for(const key of envKeys) oldEnv[key] === undefined ? delete process.env[key] : process.env[key]=oldEnv[key]; db.db.close(); });
let counter=0;
async function fixture() {
  await outreach.ready;
  const id=++counter;
  await db.insertJob({ fingerprint:`outreach-${id}`,company:'IBM',title:'Software Engineer',url:`https://careers.ibm.com/careers/JobDetail?jobId=${id}`,source:'test',sourceJobId:String(id) });
  return db.db.prepare('SELECT * FROM jobs WHERE fingerprint=?').get(`outreach-${id}`);
}
const input = { email:'recruiter@ibm.com',sourceUrl:'https://www.ibm.com/careers',subject:'Regarding your software opening',body:'Hi Hiring Team, I am interested in this opening. Thank you, Ayush.' };
function smtp() { Object.assign(process.env,{SMTP_HOST:'test.invalid',SMTP_USER:'test',SMTP_PASS:'test',OUTREACH_FROM:'ayush@example.com',OUTREACH_DAILY_LIMIT:'100',OUTREACH_AUTO_SEND:'false'}); }

test('public contacts exclude accommodation and support addresses; messages do not claim an application was submitted', async()=>{
  const job=await fixture();
  const results=contacts.publicContacts({...job,description_snippet:'Send your resume to recruiter@ibm.com for this opening.\n\n'+ ' '.repeat(300) +'For disability accommodations, contact accommodation@ibm.com.'});
  assert.equal(results.length,1); assert.equal(results[0].email,'recruiter@ibm.com');
  assert.equal(results[0].verification,'unverified');
  assert.ok(!outreach.template(job).body.includes('I applied'));
  assert.ok(contacts.searches(job).linkedin.startsWith('https://www.linkedin.com/'));
});

test('sending requires exact draft approval and cannot send the same draft twice', async()=>{
  smtp(); let sent=0;
  nodemailer.createTransport=options=>{
    assert.equal(options.requireTLS,true);
    return {sendMail:async mail=>{sent++;assert.equal(mail.to,input.email);return {accepted:[mail.to]};},close(){}};
  };
  const job=await fixture(); const draft=await outreach.save(job.id,input);
  await assert.rejects(()=>outreach.send(draft.id),/approve/);
  await assert.rejects(()=>outreach.approve(draft.id,{...input,body:'Changed message'}),/changed/);
  await outreach.approve(draft.id,input);
  const results=await Promise.allSettled([outreach.send(draft.id),outreach.send(draft.id)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
  assert.equal(sent,1);
  assert.equal((await outreach.list(job.id))[0].state,'sent');
  await assert.rejects(()=>outreach.send(draft.id),/approve/);
});

test('edits revoke approval, placeholders and email header injection are rejected', async()=>{
  const job=await fixture();
  await assert.rejects(()=>outreach.save(job.id,{...input,email:'a@ibm.com\r\nBcc:other@ibm.com'}),/email/);
  await assert.rejects(()=>outreach.save(job.id,{...input,subject:'Hello\r\nBcc: other@ibm.com'}),/subject/);
  await assert.rejects(()=>outreach.save(job.id,{...input,body:'Hi, [Your name]'}),/placeholders/);
  const draft=await outreach.save(job.id,input); await outreach.approve(draft.id,input);
  assert.equal((await outreach.save(job.id,{...input,body:input.body+' Portfolio available.'})).state,'draft');
});

test('uncertain delivery is recorded and never retried automatically', async()=>{
  smtp();let attempts=0;
  nodemailer.createTransport=()=>({sendMail:async()=>{attempts++;throw Object.assign(new Error('timeout'),{code:'ETIMEDOUT'});},close(){}});
  const job=await fixture(),draft=await outreach.save(job.id,input);await outreach.approve(draft.id,input);
  await assert.rejects(()=>outreach.send(draft.id),/uncertain/);
  assert.equal((await outreach.list(job.id))[0].state,'uncertain');
  process.env.OUTREACH_AUTO_SEND='true';await outreach.drainApproved();
  assert.equal(attempts,1);
});

test('automatic worker sends approved drafts only when enabled; daily cap is enforced', async()=>{
  smtp();let sent=0;
  nodemailer.createTransport=()=>({sendMail:async()=>{sent++;return {accepted:[input.email]};},close(){}});
  const job=await fixture(),draft=await outreach.save(job.id,input);await outreach.approve(draft.id,input);
  await outreach.drainApproved();assert.equal(sent,0);
  process.env.OUTREACH_AUTO_SEND='true';await outreach.drainApproved();assert.equal(sent,1);
  const next=await fixture(),nextDraft=await outreach.save(next.id,input);await outreach.approve(nextDraft.id,input);
  process.env.OUTREACH_DAILY_LIMIT='1';await assert.rejects(()=>outreach.send(nextDraft.id),/Daily/);
  assert.equal(sent,1);
});

test('job IDs deduplicate tracking variants without overwriting application status',async()=>{
  const job=await fixture();await db.db.prepare("UPDATE jobs SET status='applied' WHERE id=?").run(job.id);
  const inserted=await db.insertJob({fingerprint:'tracking-variant',company:'IBM',title:'Updated title',location:'Mumbai',source:'test',sourceJobId:job.source_job_id,url:job.job_url+'&utm_source=linkedin',matchQuality:'strong'});
  assert.equal(inserted,false);
  assert.equal((await db.db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id)).status,'applied');
});

test('link checks reject private hosts, arbitrary websites and non-HTTPS URLs',()=>{
  const {safeUrl}=require('./services/jobVerification');
  for(const url of ['http://careers.ibm.com/job/1','https://127.0.0.1/','https://careers.ibm.com.evil.test/','https://user:pass@careers.ibm.com/']) assert.throws(()=>safeUrl(url));
  assert.equal(safeUrl('https://careers.ibm.com/careers/JobDetail?jobId=1').hostname,'careers.ibm.com');
});
