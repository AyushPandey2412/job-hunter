const config = require('../config');
const coordinator = require('../scrapers');

class Scheduler {
  constructor() {
    this.state = { running: false, lastStartedAt: null, lastCompletedAt: null, nextRunAt: null, error: null };
    this.timer = null;
    this.onComplete = () => {};
  }
  status() { return { ...this.state, intervalMinutes: config.pollIntervalMinutes }; }
  async run() {
    if (this.state.running) return { status: 'already_running' };
    this.state.running = true;
    this.state.lastStartedAt = new Date().toISOString();
    this.state.error = null;
    try {
      const result = await coordinator.runCycle();
      this.state.lastCompletedAt = new Date().toISOString();
      this.onComplete(result);
      return result;
    } catch (error) {
      this.state.error = error.message;
      throw error;
    } finally {
      coordinator.isPolling = false;
      this.state.running = false;
    }
  }
  reschedule() {
    clearInterval(this.timer);
    const interval = config.pollIntervalMinutes * 60000;
    this.state.nextRunAt = new Date(Date.now() + interval).toISOString();
    this.timer = setInterval(() => {
      this.state.nextRunAt = new Date(Date.now() + interval).toISOString();
      this.run().catch(error => console.error('Scheduled scan failed:', error.message));
    }, interval);
  }
  start() {
    this.reschedule();
    this.run().catch(error => console.error('Startup scan failed:', error.message));
  }
  stop() { clearInterval(this.timer); this.state.nextRunAt = null; }
}
module.exports = new Scheduler();
