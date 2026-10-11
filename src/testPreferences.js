const assert = require('node:assert/strict');
const config = require('./config'); config.dbPath = ':memory:';
const db = require('./db/database');
const preferences = require('./services/preferences');
const details = require('./services/jobDetails');
const filter = require('./services/filterService');
const app = require('./server/app');
const scheduler = require('./services/scheduler');
(async () => {
await db.ready;
await preferences.ready;
const insert = (key, options = {}) => db.insertJob({ fingerprint: key, company: 'Tata Consultancy Services (TCS)', title: 'Frontend Developer', location: 'Mumbai', url: `https://example.com/${key}`, source: 'test', postedAt: new Date(Date.now() - 4 * 86400000).toISOString(), ...options });
await insert('inr', { workplaceType: 'hybrid', salaryData: { min: 600000, max: 1200000, currency: 'INR', interval: 'year' } });
await insert('usd', { salaryData: { min: 100000, max: 150000, currency: 'USD', interval: 'year' } });
await insert('monthly', { salaryData: { min: 60000, max: 100000, currency: 'INR', interval: 'month' } });
await insert('unknown', { location: 'Bangalore' });
const range = { salaryMin: 800000, salaryMax: 1500000, salaryCurrency: 'INR', salaryPeriod: 'year', includeUnknownSalary: false };
assert.equal((await db.getJobs(range)).length, 1);
assert.equal((await db.getJobs({ ...range, includeUnknownSalary: true })).length, 2);
assert.equal((await db.getJobs({ cities: ['bengaluru'] })).length, 1);
assert.equal((await db.getJobs({ cities: ['bengaluru','mumbai'] })).length, 4);
assert.equal((await db.getJobs({ workModes: ['hybrid'] })).length, 1);
assert.equal((await db.getJobs({ age: 'recent', freshDays: 7 })).length, 4);
assert.equal((await db.getJobs({ age: 'older', freshDays: 3 })).length, 4);
assert.equal(details({ salary: '6–12 LPA' }).salaryMin, 600000);
assert.equal(details({ salaryData: { minValue: null, maxValue: null, currency: 'USD', interval: 'year' } }).salaryMin, null);
assert.equal(details({ location: 'Remote - USA', isRemote: true }).remoteEligibility, 'restricted');
const settings = { ...preferences.get(), targetRoles: ['frontend'], targetLocations: ['mumbai'], workModes: ['hybrid','remote'], freshDays: 7, pollIntervalMinutes: 10 };
await preferences.save(settings);
assert.equal(config.pollIntervalMinutes, 10);
assert.equal(JSON.parse((await db.db.prepare('SELECT value FROM preferences').get()).value).freshDays, 7);
await assert.rejects(() => preferences.save({ ...settings, salaryMin: 20, salaryMax: 10 }), /Minimum/);
assert.equal(filter.evaluate({ title: 'Frontend Developer', location: 'Pune', workplaceType: 'hybrid' }).matched, false);
assert.equal(filter.evaluate({ title: 'Frontend Developer', location: 'Remote USA', isRemote: true }).matched, false);
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/api/settings'); assert.equal((await response.json()).settings.freshDays, 7);
    const put = await fetch(base + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }); assert.equal(put.status, 200);
    const job = (await db.getJobs())[0];
    const patch = await fetch(base + `/api/jobs/${job.id}/details`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: true, notes: '<script>safe as text</script>' }) }); assert.equal(patch.status, 200);
    assert.equal((await db.getJobs({ savedOnly: true }))[0].notes, '<script>safe as text</script>');
    const company = await fetch(base + '/api/jobs?company=' + encodeURIComponent('Tata Consultancy Services (TCS)')); assert.equal((await company.json()).jobs.length, 4);
    const counts = await (await fetch(base + '/api/view-counts')).json(); assert.equal(counts.counts.saved, 1); assert.equal(counts.counts.recent, 4);
    console.log('PASS: saved preferences, salary units and ranges, unknown salary, city aliases/multiselect, work modes, configurable age, remote region, notes, saved jobs, company views and HTTP endpoints');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { scheduler.stop(); server.close(); db.db.close(); }
});

})().catch(error => { console.error(error); process.exitCode = 1; });
