# Free deployment

Use a public GitHub repository for GitHub-hosted scheduled runners, Vercel Hobby for the dashboard, and Turso Free for persistent SQLite-compatible storage. Free usage limits apply. GitHub scheduled workflows can be delayed and are not an exact clock.

## Secrets

In Vercel configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, APP_PASSWORD and DISCORD_WEBHOOK_URL. The dashboard uses HTTP Basic authentication: enter any username and the configured APP_PASSWORD. Without APP_PASSWORD the Vercel app fails closed.

In GitHub repository Actions secrets configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and DISCORD_WEBHOOK_URL. Never commit .env or data/.

Import this repository into Vercel. The vercel.json entry routes requests through Express without starting the local interval timer. GitHub Actions runs discovery independently; the workflow checks saved settings to honor five- or ten-minute intervals. Trigger Run workflow for immediate scans. Free scheduled runs may be delayed by GitHub.

Existing local jobs remain in data/jobs.db. Import a consistent SQLite snapshot to Turso before switching to preserve local statuses and notes. Dashboard settings persist in the hosted database and are refreshed by the worker.

## Local use

Node.js 24+, npm ci, copy .env.example to .env and configure it, then npm start. With no TURSO_DATABASE_URL the app keeps using local SQLite and its interval scheduler. npm test verifies the dashboard queries and preference behavior. Set TURSO_DATABASE_URL=file::memory: to test the libSQL adapter.
