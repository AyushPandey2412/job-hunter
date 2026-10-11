const express = require('express');
const router = express.Router();
const dbService = require('../../db/database');
const scheduler = require('../../services/scheduler');
scheduler.onComplete = result => broadcastEvent('scan_completed', { newJobsFound: result.newJobsFound });
router.get('/scheduler', async (req, res) => res.json({ success: true, ...scheduler.status() }));
router.get('/health', async (req, res) => res.json({ success: true }));
const preferences = require('../../services/preferences');
router.use(async (req, res, next) => { try { await preferences.ready; await preferences.refresh(); next(); } catch (error) { next(error); } });
router.get('/view-counts', async (req, res) => {
  const days = preferences.get().freshDays;
  const counts = await dbService.db.prepare(`SELECT COUNT(*) AS companies,
    SUM(CASE WHEN COALESCE(datetime(posted_at), datetime(discovered_at)) >= datetime('now', ?) THEN 1 ELSE 0 END) AS recent,
    SUM(CASE WHEN COALESCE(datetime(posted_at), datetime(discovered_at)) < datetime('now', ?) THEN 1 ELSE 0 END) AS older,
    SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) AS applied,
    SUM(CASE WHEN saved = 1 THEN 1 ELSE 0 END) AS saved FROM jobs`).get(`-${days} days`, `-${days} days`);
  for (const key of Object.keys(counts)) counts[key] = counts[key] || 0;
  res.json({ success: true, freshDays: days, counts });
});
router.get('/settings', async (req, res) => res.json({ success: true, settings: preferences.get() }));
router.put('/settings', async (req, res) => {
  try {
    const settings = await preferences.save(req.body);
    require('../../services/dedupService').memoryCache.clear();
    if (!process.env.VERCEL) scheduler.reschedule();
    broadcastEvent('settings_updated', {});
    res.json({ success: true, settings });
  } catch (error) { res.status(400).json({ success: false, error: error.message }); }
});
router.patch('/jobs/:id/details', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body.notes !== 'string' || req.body.notes.length > 5000 || typeof req.body.saved !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid notes or saved flag' });
  const result = await dbService.db.prepare('UPDATE jobs SET notes = ?, saved = ? WHERE id = ?').run(req.body.notes, req.body.saved ? 1 : 0, id);
  if (!result.changes) return res.status(404).json({ success: false, error: 'Job not found' });
  broadcastEvent('job_status_updated', { id }); res.json({ success: true });
});
const discordService = require('../../services/discordService');

// In-memory SSE clients for real-time live push to the UI
const sseClients = new Set();

function broadcastEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// ----------------------------------------------------------------------------
// 1. GET /api/jobs — List filtered & paginated jobs
// ----------------------------------------------------------------------------
router.get('/jobs', async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, search, remoteOnly, tier, location, stack, role, sortBy, order, minScore, age } = req.query;
    const jobs = await dbService.getJobs({
      limit: Math.min(1000, Math.max(1, parseInt(limit, 10) || 50)),
      offset: Math.max(0, parseInt(offset, 10) || 0),
      status,
      search,
      remoteOnly: remoteOnly === 'true',
      tier,
      location,
      stack,
      role,
      sortBy,
      order,
      minScore, age, freshDays: preferences.get().freshDays,
      company: req.query.company,
      cities: String(req.query.cities || '').split(',').filter(Boolean),
      workModes: String(req.query.workModes || '').split(',').filter(Boolean),
      salaryMin: req.query.salaryMin === undefined ? null : Number(req.query.salaryMin),
      salaryMax: req.query.salaryMax === undefined ? null : Number(req.query.salaryMax),
      salaryCurrency: req.query.salaryCurrency || 'INR', salaryPeriod: req.query.salaryPeriod || 'year',
      includeUnknownSalary: req.query.includeUnknownSalary !== 'false', savedOnly: req.query.savedOnly === 'true' 
    });
    res.json({ success: true, count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 2. PATCH /api/jobs/:id/status — Update job status (applied, interview, rejected)
// ----------------------------------------------------------------------------
router.patch('/jobs/:id/status', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!['new', 'applied', 'interview', 'rejected', 'ignored'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    if (!Number.isSafeInteger(jobId) || jobId < 1) return res.status(400).json({ success: false, error: 'Invalid job ID' });
    if (!(await dbService.updateJobStatus(jobId, status))) return res.status(404).json({ success: false, error: 'Job not found' });
    broadcastEvent('job_status_updated', { id: jobId, status });
    res.json({ success: true, id: jobId, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 3. GET /api/stats — Funnel & Acceptance/Rejection Metrics
// ----------------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    const stats = await dbService.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4. POST /api/poll — Trigger immediate discovery cycle
// ----------------------------------------------------------------------------
router.post('/poll', async (req, res) => {
  try {
    if (process.env.VERCEL) return res.status(409).json({ success: false, error: 'Cloud scans run through GitHub Actions. Use Run workflow to scan immediately.' });
    if (scheduler.status().running) return res.status(409).json({ success: false, error: 'A scan is already running' });
    res.json({ success: true, message: 'Discovery cycle triggered in background.' });
    // Run async
    const result = await scheduler.run();
    if (result.discoveredJobs && result.discoveredJobs.length > 0) {
      broadcastEvent('new_jobs_found', result.discoveredJobs);
    }
  } catch (err) {
    console.error('Manual poll error:', err.message);
  }
});

// ----------------------------------------------------------------------------
// 5. POST /api/discord/test — Test Discord Webhook connection
// ----------------------------------------------------------------------------
router.post('/discord/test', async (req, res) => {
  try {
    const { webhookUrl, save } = req.body;
    if (typeof webhookUrl !== 'string' || !/^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(webhookUrl)) return res.status(400).json({ success: false, error: 'Enter a valid Discord webhook URL' });
    const ok = await discordService.sendTestNotification(webhookUrl);
    if (ok && save === true && !process.env.VERCEL) {
      const fs = require('fs');
      const envPath = require('path').resolve(__dirname, '../../../.env');
      const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
      const entry = `DISCORD_WEBHOOK_URL=${webhookUrl}`;
      const updated = /^DISCORD_WEBHOOK_URL=.*$/m.test(current) ? current.replace(/^DISCORD_WEBHOOK_URL=.*$/m, entry) : `${current.trimEnd()}\n${entry}\n`;
      fs.writeFileSync(envPath, updated, { mode: 0o600 });
      const config = require('../../config');
      const previous = config.discord.default;
      for (const key of Object.keys(config.discord)) if (!config.discord[key] || config.discord[key] === previous) config.discord[key] = webhookUrl;
      config.discord.default = webhookUrl;
    }
    res.json({ success: ok, message: save === true && ok ? 'Webhook saved. Test alert sent.' : 'Test notification sent to Discord!' });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Could not save or test the Discord webhook. Check channel permissions and connectivity.' });
  }
});

// ----------------------------------------------------------------------------
// 6. GET /api/companies — List tracked companies
// ----------------------------------------------------------------------------
router.get('/companies', async (req, res) => {
  try {
    const list = await dbService.getCompanies();
    res.json({ success: true, count: list.length, companies: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 7. GET /api/stream — Real-time Server-Sent Events (SSE) for Dashboard
// ----------------------------------------------------------------------------
router.get('/stream', async (req, res) => {
  if (process.env.VERCEL) return res.status(204).end();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

module.exports = router;
