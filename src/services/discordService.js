const axios = require('axios');
const config = require('../config');

class DiscordService {
  /**
   * Resolves the target Discord webhook URL based on job properties
   */
  resolveWebhook(job) {
    if (job.matchScore >= 80 && config.discord.urgent) {
      return { url: config.discord.urgent, channel: '#high-priority' };
    }
    if (job.isRemote && config.discord.remote) {
      return { url: config.discord.remote, channel: '#remote-jobs' };
    }
    if (job.tier === 'startup' && config.discord.startups) {
      return { url: config.discord.startups, channel: '#startups' };
    }
    if (job.tier === 'mnc' && config.discord.mnc) {
      return { url: config.discord.mnc, channel: '#mnc-careers' };
    }
    return { url: config.discord.default, channel: '#general' };
  }

  /**
   * Formats and dispatches a rich embed to Discord
   */
  async sendJobAlert(job) {
    const { url, channel } = this.resolveWebhook(job);

    if (!url) {
      console.log(`ℹ️ Discord webhook not set for ${channel}. Job stored locally in DB & Web UI.`);
      return false;
    }

    // Color: Green for 80%+, Blue for standard, Orange for urgent/MNC
    const color = job.matchScore >= 80 ? 0x22c55e : job.isRemote ? 0x06b6d4 : 0x3b82f6;

    const skillsFormatted = (job.techStack && job.techStack.length > 0)
      ? job.techStack.map(s => `\`${s}\``).join(', ')
      : '`General Software Engineering`';

    const embed = {
      title: `⚡ ${job.title}`,
      url: job.url,
      color,
      author: {
        name: `🏢 ${job.company} (${job.source.toUpperCase()} ATS)`,
        url: job.url
      },
      fields: [
        {
          name: '📍 Location & Work Mode',
          value: job.isRemote ? '🌐 **100% Remote**' : `🏢 ${job.location || 'Onsite / Hybrid'}`,
          inline: true
        },
        {
          name: '🎯 Match Score',
          value: `**${job.matchScore}% Match**`,
          inline: true
        },
        {
          name: '🏷️ Company Tier',
          value: job.tier === 'startup' ? '🚀 High-Growth Startup' : '🏛️ Global Tech / MNC',
          inline: true
        },
        {
          name: '🛠️ Matched Tech Stack',
          value: skillsFormatted,
          inline: false
        }
      ],
      description: job.snippet ? `> *${job.snippet.slice(0, 220)}...*` : '',
      footer: {
        text: `Job Hunter Autonomous Engine • Discovered just now`
      },
      timestamp: new Date().toISOString()
    };

    const payload = {
      username: 'Job Hunter AI',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/3850/3850285.png',
      content: `🚨 **New Job Detected!** Candidate #1 Alert:`,
      embeds: [embed],
      components: [] // If Bot token with interaction components is used in Phase 5
    };

    try {
      await axios.post(url, payload, { timeout: 8000 });
      console.log(`✅ [Discord Alert] Sent "${job.title}" @ ${job.company} to ${channel}`);
      return true;
    } catch (err) {
      console.error(`❌ [Discord Error] Failed sending to ${channel}:`, err.response?.data || err.message);
      return false;
    }
  }

  /**
   * Test webhook connectivity
   */
  async sendTestNotification(webhookUrl) {
    const targetUrl = webhookUrl || config.discord.default;
    if (!targetUrl) throw new Error('No Discord Webhook URL provided.');

    const payload = {
      username: 'Job Hunter AI',
      content: '✅ **Discord Webhook Connected Successfully!**',
      embeds: [
        {
          title: '🟢 System Online & Ready',
          description: 'Your real-time job detection alerts will be streamed here the second new postings match your profile.',
          color: 0x22c55e,
          fields: [
            { name: 'Scan schedule', value: `Every ${config.pollIntervalMinutes} minutes`, inline: true },
            { name: 'Filter Mode', value: '🎯 Software Engineer / Full Stack', inline: true }
          ],
          timestamp: new Date().toISOString()
        }
      ]
    };

    const res = await axios.post(targetUrl, payload, { timeout: 8000 });
    return res.status === 204 || res.status === 200;
  }
}

module.exports = new DiscordService();
