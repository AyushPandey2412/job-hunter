const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('./config');
const filter = require('./services/filterService');

test('Workday reads subsequent pages without inventing publication dates', async () => {
  const axios = require('axios');
  const original = axios.post;
  const originalGet = axios.get;
  axios.get = async () => ({ data: { jobPostingInfo: { jobDescription: '<p>React and TypeScript</p>', location: 'Mumbai' } } });
  const offsets = [];
  axios.post = async (_url, body) => {
    offsets.push(body.offset);
    assert.equal(body.searchText, '');
    return { data: { total: 21, jobPostings: Array.from({ length: body.offset === 0 ? 20 : 1 }, (_, i) => ({
      title: 'Software Engineer', locationsText: 'Mumbai', externalPath: `/job/${body.offset + i}`
    })) } };
  };
  try {
    const result = await require('./scrapers/workday').fetchJobs({
      name: 'Example', workdayConfig: { host: 'example.com', tenant: 'example', site: 'careers' }
    });
    assert.deepEqual(offsets, [0, 20]);
    assert.equal(result.jobs.length, 21);
    assert.equal(result.jobs[20].postedAt, null);
    assert.match(result.jobs[0].snippet, /React/);
    assert.equal(result.jobs[0].detailsComplete, true);
  } finally { axios.post = original; axios.get = originalGet; }
});

test('matching rejects incompatible jobs and reviews missing evidence', () => {
  const original = { ...config.filters };
  Object.assign(config.filters, {targetRoles:['software engineer','software developer','frontend'],targetKeywords:['react','typescript'],targetLocations:['mumbai','pune'],negativeKeywords:[],minMatchScore:45});
  try {
    const job={title:'Software Engineer',location:'Mumbai',snippet:'Required React and TypeScript; minimum 1 year of experience developing applications.'};
    assert.equal(filter.evaluate(job).matched,true);
    assert.equal(filter.evaluate({...job,snippet:'Required Python and Django; minimum 1 year of experience developing applications.'}).matched,false);
    for(const change of [{title:'Software Engineering Manager'},{snippet:'React; 5+ years of professional experience'},{snippet:'React; 2-5 years of experience'},{title:'Frontend C# Developer'},{title:'Frontend .NET Developer'},{location:'Bengaluru'}]) assert.equal(filter.evaluate({...job,...change}).matched,false);
    assert.equal(filter.assess({...job,snippet:'React and TypeScript'}).matchQuality,'insufficient-details');
    assert.equal(filter.assess({...job,snippet:'React; founded 10 years ago'}).review,true);
    assert.equal(filter.evaluate({...job,snippet:'Required React or Java; minimum 1 year of experience developing applications.'}).matched,true);
  } finally {Object.assign(config.filters,original);}
});
