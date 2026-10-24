const service = require('../db/database');
async function ensure() {
  await service.ready;
  await service.db.exec('CREATE TABLE IF NOT EXISTS discovery_report (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
}
module.exports = {
  async get() { await ensure(); return JSON.parse((await service.db.prepare('SELECT value FROM discovery_report WHERE id=1').get())?.value || '{}'); },
  async save(value) { await ensure(); await service.db.prepare('INSERT INTO discovery_report VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(value)); }
};
