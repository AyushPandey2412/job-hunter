require('dotenv').config();
const config = require('./src/config');
const app = require('./src/server/app');
const scheduler = require('./src/services/scheduler');
const outreachTimer = setInterval(() => require('./src/services/outreach').drainApproved().catch(error => console.warn('[Outreach]',error.message)),60000);
outreachTimer.unref();
const server = app.listen(config.port, async () => {
  await require('./src/services/preferences').ready;
  console.log(`Job Hunter listening on ${config.port}; scanning every ${config.pollIntervalMinutes} minutes`);
  scheduler.start();
});
function shutdown() {
  clearInterval(outreachTimer);
  scheduler.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
