const assert = require('node:assert/strict');
process.env.VERCEL = '1';
process.env.APP_PASSWORD = 'test-only-password';
process.env.TURSO_DATABASE_URL = 'file::memory:';
const app = require('./server/app');
const preferences = require('./services/preferences');
const cloud = require('./services/cloudScanState');
const db = require('./db/database');
(async () => {
 await preferences.ready;
 await cloud.save({lastStartedAt:'2026-01-01T00:00:00Z',lastCompletedAt:'2026-01-01T00:01:00Z',newJobsFound:2});
 const server = app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/settings')).status,401);
  const headers={Authorization:'Basic '+Buffer.from('owner:test-only-password').toString('base64')};
  const result=await fetch(base+'/api/scheduler',{headers});
  assert.equal(result.status,200);
  const state=await result.json();
  assert.equal(state.mode,'github-actions');
  assert.equal(state.newJobsFound,2);
  assert.equal(state.running,false);
  assert.equal((await fetch(base+'/api/poll',{method:'POST',headers})).status,409);
  delete process.env.APP_PASSWORD;
  assert.equal((await fetch(base+'/api/health',{headers})).status,401);
  console.log('PASS: cloud authentication fails closed, persisted scan status and independent worker routing');
 } finally {server.close();db.db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
