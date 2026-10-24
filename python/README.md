# Independent Python JobHunter

Python 3.10+, no third-party dependencies. Run `python app.py serve` here, then open http://127.0.0.1:8765. Uses a local applications.sqlite database; not deployed on Vercel. The root run_both.py starts both local apps.

Copy profile.example.json to profile.local.json and fill your answers privately. Empty or unknown fields require your input. Every suggestion requires approval. Keep private files and databases out of Git. Import JSON objects with title, location, url and description, or use `python app.py collect greenhouse BOARD_TOKEN`, `python app.py collect lever COMPANY_SLUG`, or `python app.py sync` for a local unauthenticated Node API. Hosted authenticated API sync is not supported.

The dashboard tracks questions and manual employer application links. Review all requirements and answers, upload the appropriate existing resume yourself and record a successful confirmation. The submitted status is user-attested. Unknown answers stay blank; question/answer edits revoke ready status. No automated external submissions or new Puppeteer site adapters are included.

Run `python -m unittest -v` for tests. Mumbai/Pune including Mumbai metro only, junior JS/TS/React/Node stack. Missing requirements require review; mandatory incompatible stacks, senior titles and excess experience are excluded. Verify source requirements before applying.
