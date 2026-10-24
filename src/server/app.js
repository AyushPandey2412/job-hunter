const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();

// Protect personal settings and application data on a public deployment.
app.use((req, res, next) => {
  if (!process.env.VERCEL && !process.env.APP_PASSWORD) return next();
  const expected = process.env.APP_PASSWORD;
  const supplied = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
  const crypto = require('crypto');
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Job Hunter"');
    return res.status(401).send('Sign in to Job Hunter');
  }
  next();
});
app.use(express.json());
app.use('/api', (req,res,next) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method) || !req.headers.origin) return next();
  try { if (new URL(req.headers.origin).host === req.headers.host) return next(); } catch {}
  res.status(403).json({ success:false, error:'Cross-site requests are not allowed' });
});

// API endpoints
app.use('/api', apiRoutes);

// Static Web Dashboard files
app.use(express.static(path.resolve(__dirname, '../../public')));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/index.html'));
});

module.exports = app;
