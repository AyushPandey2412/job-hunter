# Deployment compatibility

Node dashboard: existing Vercel api/index.js entrypoint with Turso. Requires TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and APP_PASSWORD in Vercel. GitHub Actions job-cron.yml runs scheduled discovery independently using Turso/Discord secrets. No new runtime dependencies required for the eligibility gate. Saved preferences can narrow candidate rules, not broaden them. Existing stored jobs are not automatically deleted or reclassified.

Python companion in python/: local CLI/server and local SQLite, not a Vercel function. Run python python/app.py serve or python run_both.py for both locally. Copy python/profile.example.json to python/profile.local.json and enter your answers privately. Never commit that file. Unknown answers remain blank; every suggested answer requires approval. Use the existing Node dashboard for the hosted application tracker. Python's local Node import does not support the hosted password-protected API. No background Python deployment was configured.

This push includes previously local discovery/outreach work required by the tested Node app, plus candidate eligibility and Python review queue. It does not add new Puppeteer adapters for the requested job sites or automatically submit applications. OUTREACH_AUTO_SEND is disabled by the combined launcher; direct Node startup retains its existing opt-in settings.

Validation: Node 22 tests passed plus Python 4 tests. Existing localhost HTTP integration tests were blocked by the sandbox. Live deployment verification follows the GitHub/Vercel status.
