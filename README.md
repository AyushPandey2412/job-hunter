# Job Hunter

Personal job discovery dashboard with AG Grid, company views, configurable keywords and city filters, work mode and salary filters, saved jobs, notes and application tracking. Jobs move between Fresh and Older views based on the configured age, defaulting to three days.

Salary and work mode appear only when reported by the source. Salary filters compare ranges in the same currency and pay period; unknown salary is optional. Remote eligibility is inferred from source locations and may need confirmation on the employer page.

## Run locally

Use Node.js 24 or newer. Run `npm ci`, copy `.env.example` to `.env`, configure the Discord webhook, then run `npm start`. Open http://localhost:3000. Local scans run at the saved five- or ten-minute interval.

## Free hosted setup

See [deployment instructions](DEPLOYMENT.md). Vercel hosts the dashboard, Turso stores persistent data, and GitHub Actions runs discovery independently. Scheduled Actions may run late; this is not a guaranteed real-time service. Keep all credentials in service secrets and never commit `.env` or `data/`.

## Commands

- `npm test`: dashboard queries, preferences and HTTP behavior using isolated databases.
- `npm run poll`: one scan with the current saved settings.
- `npm run test:discord`: send a Discord test alert.
- `npm run dev`: local development with automatic restart.

The dashboard supports manual application tracking. It does not submit applications automatically.
