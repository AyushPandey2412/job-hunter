const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const remote = !!process.env.TURSO_DATABASE_URL;
let db;
if (remote) {
  const client = require('@libsql/client').createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  db = {
    exec: sql => client.executeMultiple(sql),
    prepare: sql => ({
      all: async (...args) => (await client.execute({ sql, args })).rows,
      get: async (...args) => (await client.execute({ sql, args })).rows[0],
      run: async (...args) => { const r = await client.execute({ sql, args }); return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid }; }
    }),
    close: () => client.close()
  };
} else {
  if (process.env.VERCEL) throw new Error('Hosted database is required on Vercel');
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
}
const jobDetails = require('../services/jobDetails');

// Initialize Schemas
async function initSchema() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL,
      ats_type TEXT NOT NULL, -- 'greenhouse', 'lever', 'ashby'
      tier TEXT DEFAULT 'startup', -- 'startup', 'mnc'
      career_url TEXT,
      last_etag TEXT,
      last_polled_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL UNIQUE,
      company_name TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      is_remote INTEGER DEFAULT 0,
      job_url TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL, -- 'greenhouse', 'lever', 'ashby'
      tier TEXT DEFAULT 'startup',
      tech_stack TEXT, -- JSON array of matched skills
      experience_level TEXT,
      salary_range TEXT,
      description_snippet TEXT,
      match_score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'new', -- 'new', 'applied', 'interview', 'rejected', 'ignored'
      posted_at TEXT,
      discovered_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      apply_type TEXT DEFAULT 'manual', -- 'auto_ats', 'manual', 'cold_email', 'referral'
      status TEXT DEFAULT 'submitted', -- 'submitted', 'viewed', 'interview', 'rejected'
      ats_match_score INTEGER,
      views_count INTEGER DEFAULT 0,
      last_viewed_at TEXT,
      notes TEXT,
      applied_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER,
      event_type TEXT NOT NULL, -- 'email_open', 'link_click', 'portal_status_sync'
      target_url TEXT,
      user_agent TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_discovered_at ON jobs(discovered_at);
  `);

  // Seed default companies
  const insertComp = db.prepare(`
    INSERT INTO companies (name, token, ats_type, tier, career_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      token = excluded.token,
      ats_type = excluded.ats_type,
      tier = excluded.tier
  `);

  for (const comp of config.companies) {
    await insertComp.run(comp.name, comp.token, comp.ats, comp.tier, null);
  }
}

// Seed on startup
const ready = (async () => {
await initSchema();
const additions = { work_mode: "TEXT DEFAULT 'unknown'", salary_min: 'REAL', salary_max: 'REAL', salary_currency: "TEXT DEFAULT ''", salary_period: "TEXT DEFAULT ''", saved: 'INTEGER DEFAULT 0', notes: "TEXT DEFAULT ''" };
Object.assign(additions, { source_job_id: "TEXT DEFAULT ''", source_job_key: 'TEXT', match_quality: "TEXT DEFAULT 'possible'", match_reasons: "TEXT DEFAULT '[]'", required_qualifications: "TEXT DEFAULT ''", preferred_qualifications: "TEXT DEFAULT ''", availability: "TEXT DEFAULT 'unknown'", verified_at: 'TEXT' });
const existing = new Set((await db.prepare('PRAGMA table_info(jobs)').all()).map(c => c.name));
for (const [name, type] of Object.entries(additions)) if (!existing.has(name)) await db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_key ON jobs(source_job_key) WHERE source_job_key IS NOT NULL');
if (!existing.has('work_mode')) {
  for (const row of await db.prepare('SELECT * FROM jobs').all()) {
    const info = jobDetails({ location: row.location, title: row.title, snippet: row.description_snippet, isRemote: !!row.is_remote, salary: row.salary_range === 'Competitive' ? '' : row.salary_range });
    await db.prepare('UPDATE jobs SET work_mode=?, salary_min=?, salary_max=?, salary_currency=?, salary_period=? WHERE id=?').run(info.workMode, info.salaryMin, info.salaryMax, info.salaryCurrency, info.salaryPeriod, row.id);
  }
  await db.exec('UPDATE companies SET last_etag = NULL');
}

})();

// Helper database functions
const dbService = {
  db, ready,
  async enrichJob(jobData) {
    const info = jobDetails(jobData);
    await db.prepare(`UPDATE jobs SET
      work_mode = CASE WHEN ? != 'unknown' THEN ? ELSE work_mode END,
      salary_min = COALESCE(?, salary_min), salary_max = COALESCE(?, salary_max),
      salary_currency = CASE WHEN ? != '' THEN ? ELSE salary_currency END,
      salary_period = CASE WHEN ? != '' THEN ? ELSE salary_period END,
      salary_range = CASE WHEN ? != 'Not specified' AND ? != 'Competitive' THEN ? ELSE salary_range END
      WHERE fingerprint = ?`).run(info.workMode, info.workMode, info.salaryMin, info.salaryMax, info.salaryCurrency, info.salaryCurrency, info.salaryPeriod, info.salaryPeriod, info.salary, info.salary, info.salary, jobData.fingerprint);
  },

  async updateDiscoveryDetails(id, job, key = require('../services/jobIdentity').identity(job)) {
    await db.prepare(`UPDATE jobs SET source_job_id=?, source_job_key=?, match_quality=?, match_reasons=?,
      required_qualifications=?, preferred_qualifications=?, availability=?, verified_at=COALESCE(?,verified_at),
      description_snippet=CASE WHEN ? != '' THEN ? ELSE description_snippet END,
      experience_level=COALESCE(?,experience_level), match_score=COALESCE(?,match_score) WHERE id=?`).run(
      key.sourceJobId, key.sourceJobKey, job.matchQuality || 'possible', JSON.stringify(job.matchReasons || []),
      job.requiredQualifications || '', job.preferredQualifications || '', job.availability || 'unknown', job.verifiedAt || null,
      job.snippet || '', job.snippet || '', job.experienceLevel || null, job.matchScore ?? null, id);
  },

  // Jobs
  async insertJob(jobData) {
    try {
      const key = require('../services/jobIdentity').identity(jobData);
      jobData.url = key.url;
      const existingJob = await db.prepare('SELECT id FROM jobs WHERE source_job_key = ? OR job_url = ? LIMIT 1').get(key.sourceJobKey, key.url);
      if (existingJob) { await this.updateDiscoveryDetails(existingJob.id, jobData, key); return false; }
      const stmt = db.prepare(`
        INSERT INTO jobs (
          fingerprint, company_name, title, location, is_remote,
          job_url, source, tier, tech_stack, experience_level,
          salary_range, description_snippet, match_score, status, posted_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      await stmt.run(
        jobData.fingerprint,
        jobData.company,
        jobData.title,
        jobData.location || 'Not Specified',
        jobData.isRemote ? 1 : 0,
        jobData.url,
        jobData.source,
        jobData.tier || 'startup',
        JSON.stringify(jobData.techStack || []),
        jobData.experienceLevel || 'Experience not specified',
        jobData.salary || 'Competitive',
        jobData.snippet || '',
        jobData.matchScore || 0,
        'new',
        jobData.postedAt || null
      );

      const info = jobDetails(jobData);
      await db.prepare('UPDATE jobs SET work_mode=?, salary_min=?, salary_max=?, salary_currency=?, salary_period=?, salary_range=? WHERE fingerprint=?').run(info.workMode, info.salaryMin, info.salaryMax, info.salaryCurrency, info.salaryPeriod, info.salary, jobData.fingerprint);
      const stored = await db.prepare('SELECT id FROM jobs WHERE fingerprint = ?').get(jobData.fingerprint);
      await this.updateDiscoveryDetails(stored.id, jobData, key);
      return true;
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return false; // Already exists
      }
      console.error('âŒ Insert Job DB Error:', err.message);
      return false;
    }
  },

  async getFingerprints() { return (await db.prepare('SELECT fingerprint FROM jobs').all()).map(row => row.fingerprint); },

  async hasJob(fingerprint) {
    const stmt = db.prepare('SELECT id FROM jobs WHERE fingerprint = ? LIMIT 1');
    const row = await stmt.get(fingerprint);
    return !!row;
  },

  async getJobs({ limit = 50, offset = 0, status, search, remoteOnly, tier, location, stack, role, sortBy = 'newest', order, minScore, age, freshDays = 3, company, cities = [], workModes = [], salaryMin, salaryMax, salaryCurrency, salaryPeriod, includeUnknownSalary = true, savedOnly, matchQuality } = {}) {
    let query = "SELECT * FROM jobs WHERE (match_quality != 'excluded' OR saved = 1 OR status != 'new') AND (availability != 'closed' OR saved = 1 OR status != 'new')";
    const params = [];

    if (age === 'recent' || age === 'older') {
      query += ` AND COALESCE(datetime(posted_at), datetime(discovered_at)) ${age === 'recent' ? '>=' : '<'} datetime('now', ?)`;
      params.push(`-${freshDays} days`);
    }

    if (matchQuality && ['strong','possible','insufficient-details'].includes(matchQuality)) { query += ' AND match_quality = ?'; params.push(matchQuality); }
    if (company) { query += ' AND company_name = ?'; params.push(company); }
    if (savedOnly) query += ' AND saved = 1';
    if (cities.length) {
      const aliases = { bengaluru: ['bengaluru','bangalore'], bangalore: ['bengaluru','bangalore'], mumbai: ['mumbai','navi mumbai','thane'], delhi: ['delhi','noida','gurgaon','gurugram','ncr'], gurgaon: ['gurgaon','gurugram'] };
      const values = cities.flatMap(city => aliases[city.toLowerCase()] || [city]);
      query += ' AND (' + values.map(() => 'LOWER(location) LIKE ?').join(' OR ') + ')'; params.push(...values.map(v => `%${v.toLowerCase()}%`));
    }
    if (workModes.length) { query += ' AND work_mode IN (' + workModes.map(() => '?').join(',') + ')'; params.push(...workModes); }
    if (salaryMin != null || salaryMax != null) {
      const checks = ['salary_min IS NOT NULL', 'salary_max IS NOT NULL', 'salary_currency = ?', 'salary_period = ?'];
      const salaryParams = [salaryCurrency, salaryPeriod];
      if (salaryMin != null) { checks.push('salary_max >= ?'); salaryParams.push(salaryMin); }
      if (salaryMax != null) { checks.push('salary_min <= ?'); salaryParams.push(salaryMax); }
      query += ' AND (' + checks.join(' AND ') + (includeUnknownSalary ? ' OR salary_min IS NULL OR salary_max IS NULL' : '') + ')'; params.push(...salaryParams);
    } else if (!includeUnknownSalary) query += ' AND salary_min IS NOT NULL AND salary_max IS NOT NULL';
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (remoteOnly) {
      query += ' AND is_remote = 1';
    }
    if (tier && tier !== 'all') {
      query += ' AND tier = ?';
      params.push(tier);
    }
    if (location && location !== 'all') {
      if (location === 'remote') {
        query += ' AND is_remote = 1';
      } else if (location === 'mumbai') {
        query += " AND (location LIKE '%mumbai%' OR location LIKE '%thane%')";
      } else if (location === 'delhi') {
        query += " AND (location LIKE '%delhi%' OR location LIKE '%noida%' OR location LIKE '%gurgaon%' OR location LIKE '%ncr%')";
      } else if (location === 'bengaluru') {
        query += " AND (location LIKE '%bengaluru%' OR location LIKE '%bangalore%')";
      } else {
        query += " AND location LIKE ?";
        params.push(`%${location}%`);
      }
    }
    if (stack && stack !== 'all') {
      query += " AND (tech_stack LIKE ? OR LOWER(title) LIKE ?)";
      params.push(`%${stack}%`, `%${stack}%`);
    }
    if (role && role !== 'all') {
      query += " AND LOWER(title) LIKE ?";
      params.push(`%${role}%`);
    }
    if (minScore) {
      query += " AND match_score >= ?";
      params.push(parseInt(minScore, 10));
    }
    if (search) {
      query += ' AND (title LIKE ? OR company_name LIKE ? OR tech_stack LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    // Flexible Sorting: Newest (DESC), Oldest (ASC), Score (DESC/ASC), Company (ASC/DESC)
    const normalizedSort = (sortBy || 'newest').toLowerCase();
    const normalizedOrder = (order || '').toLowerCase();

    if (
      normalizedSort === 'oldest' ||
      normalizedSort === 'date_asc' ||
      normalizedSort === 'asc' ||
      ((normalizedSort === 'date' || normalizedSort === 'newest') && normalizedOrder === 'asc')
    ) {
      query += ' ORDER BY COALESCE(datetime(posted_at), datetime(discovered_at)) ASC, id ASC LIMIT ? OFFSET ?';
    } else if (
      normalizedSort === 'score_asc' ||
      (normalizedSort === 'score' && normalizedOrder === 'asc')
    ) {
      query += ' ORDER BY match_score ASC, COALESCE(datetime(posted_at), datetime(discovered_at)) ASC, id ASC LIMIT ? OFFSET ?';
    } else if (normalizedSort === 'score' || normalizedSort === 'score_desc') {
      query += ' ORDER BY match_score DESC, COALESCE(datetime(posted_at), datetime(discovered_at)) DESC, id DESC LIMIT ? OFFSET ?';
    } else if (normalizedSort === 'company_asc' || (normalizedSort === 'company' && normalizedOrder === 'asc')) {
      query += ' ORDER BY company_name ASC, id DESC LIMIT ? OFFSET ?';
    } else if (normalizedSort === 'company_desc' || (normalizedSort === 'company' && normalizedOrder === 'desc')) {
      query += ' ORDER BY company_name DESC, id DESC LIMIT ? OFFSET ?';
    } else {
      // Default: 'newest', 'date_desc', 'desc' -> Latest Posted First
      query += ' ORDER BY COALESCE(datetime(posted_at), datetime(discovered_at)) DESC, id DESC LIMIT ? OFFSET ?';
    }
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const rows = await stmt.all(...params);

    return rows.map(r => ({
      ...r,
      remote_eligibility: jobDetails({ location: r.location, title: r.title, workplaceType: r.work_mode, isRemote: !!r.is_remote }).remoteEligibility,
      tech_stack: r.tech_stack ? JSON.parse(r.tech_stack) : [],
      is_remote: !!r.is_remote
    }));
  },

  async updateJobStatus(jobId, status) {
    const stmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
    const result = await stmt.run(status, jobId);
    if (!result.changes) return false;

    // If status is applied, create or update application record
    if (status === 'applied') {
      const appStmt = db.prepare(`
        INSERT INTO applications (job_id, apply_type, status)
        SELECT ?, 'manual', 'submitted' WHERE NOT EXISTS (SELECT 1 FROM applications WHERE job_id = ?)
      `);
      try {
        await appStmt.run(jobId, jobId);
      } catch (e) {
        // Already recorded
      }
    }
    return true;
  },

  async getStats() {
    const totalJobs = (await db.prepare('SELECT COUNT(*) as count FROM jobs').get()).count;
    const newJobs = (await db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'new'").get()).count;
    const appliedJobs = (await db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'applied'").get()).count;
    const interviewJobs = (await db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'interview'").get()).count;
    const rejectedJobs = (await db.prepare("SELECT COUNT(*) as count FROM jobs WHERE status = 'rejected'").get()).count;
    const remoteJobs = (await db.prepare('SELECT COUNT(*) as count FROM jobs WHERE is_remote = 1').get()).count;

    return {
      total: totalJobs,
      new: newJobs,
      applied: appliedJobs,
      interview: interviewJobs,
      rejected: rejectedJobs,
      remote: remoteJobs,
      shortlistRate: appliedJobs > 0 ? ((interviewJobs / appliedJobs) * 100).toFixed(1) : 0
    };
  },

  async updateCompanyEtag(name, etag) {
    const stmt = db.prepare('UPDATE companies SET last_etag = ?, last_polled_at = datetime(\'now\') WHERE name = ?');
    await stmt.run(etag, name);
  },

  async getCompanies() {
    return db.prepare('SELECT * FROM companies ORDER BY name ASC').all();
  }
};

module.exports = dbService;

