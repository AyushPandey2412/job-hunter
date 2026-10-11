const crypto = require('crypto');
const dbService = require('../db/database');

class DedupService {
  constructor() {
    this.memoryCache = new Set();
  }

  /**
   * Generates a unique SHA-256 hash for a job
   */
  generateFingerprint(company, title, location, url) {
    const raw = `${(company || '').toLowerCase().trim()}:${(title || '').toLowerCase().trim()}:${(location || '').toLowerCase().trim()}:${(url || '').trim()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Checks if job has already been seen and stored
   */
  async isDuplicate(fingerprint) {
    if (this.memoryCache.has(fingerprint)) {
      return true;
    }
    const existsInDb = await dbService.hasJob(fingerprint);
    if (existsInDb) {
      this.memoryCache.add(fingerprint);
      return true;
    }
    return false;
  }

  /**
   * Marks job as seen
   */
  markSeen(fingerprint) {
    this.memoryCache.add(fingerprint);
  }
}

module.exports = new DedupService();
