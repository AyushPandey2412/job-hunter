const router = require('express').Router();
const outreach = require('../../services/outreach');
const contacts = require('../../services/recruiterContacts');
const run = handler => async (req,res) => { try { await handler(req,res); } catch (error) { res.status(400).json({ success: false, error: error.message }); } };
router.get('/outreach/config', run(async (_req,res) => res.json({ success:true, smtpConfigured:outreach.configured(),
  hunterConfigured:!!process.env.HUNTER_API_KEY, autoSend:process.env.OUTREACH_AUTO_SEND === 'true',
  from:process.env.OUTREACH_FROM || '', candidate:outreach.profile() })));
router.get('/jobs/:id/recruiter', run(async (req,res) => {
  const job = await outreach.getJob(req.params.id);
  res.json({ success:true, contacts:contacts.publicContacts(job), searches:contacts.searches(job),
    domain:contacts.domain(job.company_name), template:outreach.template(job), drafts:await outreach.list(job.id) });
}));
router.post('/jobs/:id/recruiter/lookup', run(async (req,res) => {
  const job = await outreach.getJob(req.params.id);
  res.json({ success:true, contacts:await contacts.hunter(job) });
}));
router.post('/jobs/:id/verify', run(async (req,res) => res.json({ success:true,
  ...await require('../../services/jobVerification').verify(await outreach.getJob(req.params.id)) })));
router.post('/jobs/:id/outreach', run(async (req,res) => res.json({ success:true, draft:await outreach.save(req.params.id,req.body) })));
router.post('/outreach/:id/approve', run(async (req,res) => {
  if (req.body.confirm !== true) throw new Error('Review the recipient and message before approving');
  res.json({ success:true, draft:await outreach.approve(Number(req.params.id),req.body) });
}));
router.post('/outreach/:id/send', run(async (req,res) => {
  if (req.body.confirm !== true) throw new Error('Confirm sending the reviewed message');
  res.json({ success:true, ...await outreach.send(Number(req.params.id)) });
}));
module.exports = router;
