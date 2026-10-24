const config = require('../config');
const service = require('../db/database');
const defaults = { ...config.filters, workModes: ['remote', 'hybrid', 'onsite', 'unknown'], remoteScope: 'india', includeUnknownRemote: true, salaryMin: null, salaryMax: null, salaryCurrency: 'INR', salaryPeriod: 'year', includeUnknownSalary: true, freshDays: 3, pollIntervalMinutes: config.pollIntervalMinutes };
let current = { ...defaults };
async function refresh() {
  await service.ready;
  await service.db.exec('CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL)');
  current = { ...defaults, ...JSON.parse((await service.db.prepare('SELECT value FROM preferences WHERE id = 1').get())?.value || '{}') };
  apply();
}
const ready = refresh();
function apply() { Object.assign(config.filters, current); config.pollIntervalMinutes = current.pollIntervalMinutes; }
apply();
module.exports = {
  ready, refresh,
  get: () => structuredClone(current),
  async save(input) {
    const next = {};
    for (const key of ['targetRoles', 'targetKeywords', 'negativeKeywords', 'targetLocations', 'workModes']) {
      if (!Array.isArray(input[key]) || input[key].length > 100 || input[key].some(v => typeof v !== 'string' || v.length > 100)) throw new Error(`Invalid ${key}`);
      next[key] = [...new Set(input[key].map(v => v.trim().toLowerCase()).filter(Boolean))];
    }
    if (!next.workModes.length || next.workModes.some(v => !['remote', 'hybrid', 'onsite', 'unknown'].includes(v))) throw new Error('Choose valid work modes');
    for (const key of ['salaryMin', 'salaryMax']) { next[key] = input[key] === null || input[key] === '' ? null : Number(input[key]); if (next[key] !== null && (!Number.isFinite(next[key]) || next[key] < 0)) throw new Error('Invalid salary'); }
    if (next.salaryMin !== null && next.salaryMax !== null && next.salaryMin > next.salaryMax) throw new Error('Minimum salary exceeds maximum');
    next.salaryCurrency = String(input.salaryCurrency || '').toUpperCase();
    if (!/^[A-Z]{3}$/.test(next.salaryCurrency)) throw new Error('Use a three-letter currency');
    if (!['year', 'month', 'hour'].includes(input.salaryPeriod)) throw new Error('Invalid salary period');
    next.salaryPeriod = input.salaryPeriod;
    next.includeUnknownSalary = input.includeUnknownSalary === true;
    next.remoteScope = input.remoteScope || 'india';
    if (!['india','any'].includes(next.remoteScope)) throw new Error('Invalid remote eligibility');
    next.includeUnknownRemote = input.includeUnknownRemote === true;
    next.freshDays = Number(input.freshDays); next.pollIntervalMinutes = Number(input.pollIntervalMinutes);
    next.minMatchScore = Number(input.minMatchScore);
    if (!Number.isInteger(next.freshDays) || next.freshDays < 1 || next.freshDays > 365 || ![5, 10].includes(next.pollIntervalMinutes) || !Number.isFinite(next.minMatchScore) || next.minMatchScore < 0 || next.minMatchScore > 100) throw new Error('Invalid age, interval or score');
    await service.db.prepare('INSERT INTO preferences VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value').run(JSON.stringify(next));
    // Re-evaluate unchanged boards after filters change; their ETags only track source changes.
    await service.db.exec('UPDATE companies SET last_etag = NULL');
    current = next; apply(); return this.get();
  }
};
