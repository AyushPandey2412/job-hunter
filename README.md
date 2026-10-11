# ⚡ Job Hunter AI — Autonomous Real-Time Job Detection & Alert Engine

Dashboard preferences, salary/work-mode filters, company views, saved jobs and notes are available. See [deployment and settings](DEPLOYMENT.md). Requires Node.js 24 or newer. Run `npm test` for isolated checks.

An autonomous, ultra-low latency job detection and outreach engine designed to give you **instant first-mover advantage** by monitoring Direct ATS APIs (Greenhouse, Lever, Ashby) and sending alerts to Discord and your local Web Dashboard within seconds.

---

## 🚀 Key Features

* **Direct ATS Monitoring (< 60s Latency):** Directly queries Greenhouse, Lever, and Ashby endpoints without captchas or IP bans.
* **Smart Filter & Match Engine:** Extracts matched tech skills, filters out senior 8+ yr titles, calculates 0–100% match score, and tags 100% remote roles.
* **Zero Duplicates:** SHA-256 fingerprint deduplication engine backed by SQLite and in-memory cache.
* **Multi-Channel Discord Router:** Sends rich embed job cards with direct apply links to `#remote-jobs`, `#startups`, `#mnc-careers`, or `#high-priority`.
* **Interactive Web Dashboard:** Modern dark-theme control plane on `http://localhost:3000` with live job feeds, application funnel metrics (Applied, Interview Calls, Rejections), and manual scan triggers.
* **100% Free 24/7 Hosting Ready:** Can run locally, on GitHub Actions, or on an Oracle Cloud "Always Free" VM ($0 lifetime).

---

## 🛠️ Quickstart

### 1. Install Dependencies
```bash
cd JobHunter
npm install
```

### 2. Configure Environment (.env)
Edit `.env` to customize your Discord Webhook and keywords:
```env
PORT=3000
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-id/your-token
TARGET_ROLES=Full Stack,Frontend,Backend,Software Engineer,MERN,Node.js,React
TARGET_KEYWORDS=react,nodejs,typescript,javascript,express,nextjs,postgres,docker
MIN_MATCH_SCORE=45
POLL_INTERVAL_MINUTES=5
```

### 3. Start the Engine & Dashboard
```bash
npm start
```
Open your browser to: **`http://localhost:3000`**

---

## 📂 Project Structure

```
JobHunter/
├── data/
│   └── jobs.db               # SQLite database (jobs, stats, companies)
├── public/
│   ├── index.html            # Web UI Dashboard
│   ├── style.css             # Dark theme styles & glassmorphism
│   └── app.js                # SSE live updates & dashboard interactions
├── src/
│   ├── config/
│   │   ├── index.js          # Configuration loader
│   │   └── companies.js      # 40+ curated top tech companies
│   ├── db/
│   │   └── database.js       # Database schema & query helpers
│   ├── scrapers/
│   │   ├── greenhouse.js     # Greenhouse ATS scraper (ETag cached)
│   │   ├── lever.js          # Lever ATS scraper
│   │   ├── ashby.js          # Ashby ATS scraper (OpenAI, Anthropic, etc.)
│   │   └── index.js          # Central scraper coordinator
│   ├── server/
│   │   ├── app.js            # Express app
│   │   └── routes/api.js     # REST API & SSE live stream
│   └── services/
│       ├── dedupService.js   # SHA-256 deduplication
│       ├── discordService.js # Discord Rich Embed generator
│       └── filterService.js  # Skill matching & match score scoring
├── index.js                  # Main server & recurring scheduler
└── package.json
```

---

## 🧪 CLI Commands

* **Run one-shot scan:** `npm run poll`
* **Test Discord Webhook:** `npm run test:discord`
* **Dev mode with auto-reload:** `npm run dev`
