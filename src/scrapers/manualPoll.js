require('dotenv').config();
if (process.env.GITHUB_ACTIONS && (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) throw new Error('Hosted database secrets are required for scheduled scans');
const preferences = require('../services/preferences');
const scraperCoordinator = require('./index');

async function main() {
  await preferences.ready;
  if (process.env.GITHUB_ACTIONS) {
    const db = require('../db/database').db;
    await db.exec('CREATE TABLE IF NOT EXISTS scan_state (id INTEGER PRIMARY KEY, started_at TEXT)');
    const last = await db.prepare('SELECT started_at FROM scan_state WHERE id=1').get();
    if (last && Date.now() - Date.parse(last.started_at) < (preferences.get().pollIntervalMinutes * 60000 - 15000)) {
      console.log('Waiting for configured scan interval'); return;
    }
    await db.prepare('INSERT INTO scan_state VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at').run(new Date().toISOString());
  }
  console.log('⚡ Running Manual One-Shot ATS Scan...');
  const result = await scraperCoordinator.runCycle();
  console.log('Scan complete:', { status: result.status, newJobsFound: result.newJobsFound });
  process.exit(0);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
