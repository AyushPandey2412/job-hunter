require('dotenv').config();
const path = require('path');
const companies = require('./companies');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Database Path
  dbPath: path.resolve(process.env.DB_PATH || path.join(__dirname, '../../data/jobs.db')),

  // Discord Webhooks
  discord: {
    default: process.env.DISCORD_WEBHOOK_URL || '',
    remote: process.env.DISCORD_WEBHOOK_REMOTE || process.env.DISCORD_WEBHOOK_URL || '',
    startups: process.env.DISCORD_WEBHOOK_STARTUPS || process.env.DISCORD_WEBHOOK_URL || '',
    mnc: process.env.DISCORD_WEBHOOK_MNC || process.env.DISCORD_WEBHOOK_URL || '',
    urgent: process.env.DISCORD_WEBHOOK_URGENT || process.env.DISCORD_WEBHOOK_URL || ''
  },

  // Keywords & Filters
  filters: {
    targetRoles: (process.env.TARGET_ROLES || 'full stack,full-stack,fullstack,frontend,front-end,backend,back-end,software engineer,software developer,web developer,sde,mern,node.js,react')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
    targetKeywords: (process.env.TARGET_KEYWORDS || 'react,reactjs,react.js,node,nodejs,node.js,typescript,javascript,express,express.js,nextjs,next.js,mongodb,postgres,postgresql,sql,redis,aws,docker,rest api,graphql,html,css,tailwind,git,jest,vitest,playwright')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
    negativeKeywords: (process.env.NEGATIVE_KEYWORDS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
    targetLocations: (process.env.TARGET_LOCATIONS || 'mumbai,pune')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
    minMatchScore: parseInt(process.env.MIN_MATCH_SCORE, 10) || 45
  },

  // Polling schedule
  pollIntervalMinutes: [5, 10].includes(Number(process.env.POLL_INTERVAL_MINUTES)) ? Number(process.env.POLL_INTERVAL_MINUTES) : 5,
  maxJobsPerCycle: parseInt(process.env.MAX_JOBS_PER_CYCLE, 10) || 50,

  // Redis config
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    url: process.env.REDIS_URL || undefined
  },

  // Companies directory
  companies
};
