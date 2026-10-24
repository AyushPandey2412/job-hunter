const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const config = require('./config');
config.dbPath = ':memory:';

test('IBM maps full requirements and reads every result page', async () => {
  const original = axios.post;
  const offsets = [];
  axios.post = async (_url, body) => {
    offsets.push(body.from);
    assert.ok(body._source.includes('body'));
    assert.deepEqual(body.sort, [{ dcdate: 'desc' }, { _id: 'asc' }]);
    return { data: { hits: { total: { value: 101 }, hits: Array.from({ length: body.from ? 1 : 100 }, (_, i) => ({
      _source: { title: 'Application Developer-ReactJS', url: `https://careers.ibm.com/careers/JobDetail?jobId=${body.from + i}`,
        body: 'React; 2 years of experience', description: 'Truncated introduction', field_keyword_05: 'India',
        field_keyword_19: 'Mumbai, IN', field_keyword_17: 'Hybrid', dcdate: '2026-10-01' }
    })) } } };
  };
  try {
    const result = await require('./scrapers/ibm').fetchJobs({ name: 'IBM' });
    assert.deepEqual(offsets, [0, 100]);
    assert.equal(result.jobs.length, 101);
    assert.equal(result.truncated, false);
    assert.match(result.jobs[0].snippet, /React/);
    assert.match(result.jobs[0].location, /Mumbai/);
    assert.equal(result.jobs[0].workplaceType, 'Hybrid');
    axios.post = async () => ({ data: { hits: { hits: [] }, timed_out: true } });
    await assert.rejects(() => require('./scrapers/ibm').fetchJobs({ name: 'IBM' }), /incomplete/);
  } finally { axios.post = original; }
});

test('Amazon includes qualifications, keeps direct URLs and paginates', async () => {
  const original = axios.get;
  const offsets = [];
  axios.get = async (_url, { params }) => {
    offsets.push(params.offset);
    assert.equal(params.country, 'IND');
    return { data: { hits: 101, jobs: Array.from({ length: params.offset ? 1 : 100 }, (_, i) => ({
      title: 'Software Development Engineer', job_path: `/en/jobs/${params.offset + i}/engineer`, city: 'Bengaluru',
      description: '<p>React</p>', basic_qualifications: '<p>2 years of experience</p>'
    })) } };
  };
  try {
    const result = await require('./scrapers/amazon').fetchJobs({ name: 'Amazon' });
    assert.deepEqual(offsets, [0, 100]);
    assert.equal(result.jobs.length, 101);
    assert.match(result.jobs[0].snippet, /2 years of experience/);
    assert.equal(result.jobs[0].postedAt, null);
    assert.equal(result.jobs[0].url, 'https://www.amazon.jobs/en/jobs/0/engineer');
    axios.get = async () => ({ data: '<html>Blocked</html>' });
    await assert.rejects(() => require('./scrapers/amazon').fetchJobs({ name: 'Amazon' }), /invalid/);
  } finally { axios.get = original; }
});

test('scan reports distinguish failed sources, mismatches and duplicates; lock recovers', async () => {
  const db = require('./db/database');
  const preferences = require('./services/preferences');
  await preferences.ready;
  const coordinator = require('./scrapers');
  const adapters = ['ibm', 'amazon', 'instahyre', 'startupHub', 'indeedRss'].map(name => require('./scrapers/' + name));
  const originals = adapters.map(adapter => adapter.fetchJobs);
  const originalCompanies = db.getCompanies;
  const originalAlert = require('./services/discordService').sendJobAlert;
  const originalFilters = { ...config.filters };
  const job = { company: 'IBM', title: 'Software Engineer', location: 'Mumbai', snippet: 'React', url: 'https://example.com/1', source: 'test' };
  try {
    Object.assign(config.filters, { targetRoles: ['software engineer'], targetKeywords: ['react'], targetLocations: ['mumbai'], negativeKeywords: [], minMatchScore: 45 });
    db.getCompanies = async () => [{ name: 'IBM', token: 'ibm', ats_type: 'ibm' }, { name: 'Amazon', token: 'amazon', ats_type: 'amazon' }];
    adapters[0].fetchJobs = async () => ({ modified: true, jobs: [job, { ...job, url: 'https://example.com/2', snippet: 'Python machine learning with pandas and numpy. Building data science models and analytics pipelines.', detailsComplete: true }] });
    adapters[1].fetchJobs = async () => { throw new Error('Feed unavailable'); };
    for (const adapter of adapters.slice(2)) adapter.fetchJobs = async () => ({ modified: true, jobs: [] });
    require('./services/discordService').sendJobAlert = async () => false;
    const result = await coordinator.runCycle();
    assert.equal(result.status, 'partial');
    assert.equal(result.newJobsFound, 1);
    assert.equal(result.sources[0].rejected, 1);
    assert.equal(result.sources[1].status, 'error');
    assert.equal((await require('./services/scanReport').get()).failedSources, 1);
    const second = await coordinator.runCycle();
    assert.equal(second.sources[0].duplicates, 1);
    db.getCompanies = async () => { throw new Error('Database unavailable'); };
    await assert.rejects(() => coordinator.runCycle(), /Database unavailable/);
    assert.equal(coordinator.isPolling, false);
  } finally {
    adapters.forEach((adapter, i) => { adapter.fetchJobs = originals[i]; });
    db.getCompanies = originalCompanies;
    require('./services/discordService').sendJobAlert = originalAlert;
    Object.assign(config.filters, originalFilters);
    db.db.close();
  }
});
