# 🔔 Discord Webhook Setup Guide (Step-by-Step)

Follow these simple steps (takes under 60 seconds) to get your Discord Webhook URL so you receive real-time job alerts on your phone or PC.

---

### Step 1: Open Discord & Pick / Create a Server
1. Open **Discord** on your desktop app or browser ([discord.com/app](https://discord.com/app)).
2. If you don't already have your own personal server, click the **`+` (Add a Server)** icon on the left sidebar ➔ Select **"Create My Own"** ➔ **"For me and my friends"** ➔ Name it (e.g. *Ayush Career Bot*).

---

### Step 2: Create Your Alert Channel(s)
1. Inside your server, click the **`+`** icon next to **Text Channels**.
2. Name the channel:
   - For a single all-in-one channel: `#job-alerts`
   - Or separate channels if you want organization:
     - `#remote-jobs`
     - `#startups`
     - `#mnc-careers`
     - `#high-priority`

---

### Step 3: Generate the Webhook URL
1. Hover over your channel (e.g., `#job-alerts`) and click the ⚙️ **Edit Channel** (gear icon).
2. On the left menu, click **Integrations**.
3. Click **Webhooks** (or **Create Webhook** / **New Webhook**).
4. Give it a name: `Job Hunter AI`.
5. Click **"Copy Webhook URL"**.

The URL looks like this:
```
<YOUR_DISCORD_WEBHOOK_URL>
```

---

### Step 4: Test & Connect

#### Method A: Test via Dashboard (Instant)
1. Open your dashboard at **[http://localhost:3000](http://localhost:3000)**.
2. Click **"Discord Alert Setup"** in the top navigation.
3. Paste your Webhook URL into the box.
4. Click **"Send Test Notification"**.
5. Check Discord—you will immediately see a green confirmation card!

#### Method B: Save to `.env` (Permanent)
Open your `JobHunter/.env` file and paste the URL:
```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL_HERE
```
Save the file. Now every new job discovered will automatically ping your Discord channel!
