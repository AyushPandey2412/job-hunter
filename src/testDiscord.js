require('dotenv').config();
const discordService = require('./services/discordService');

async function test() {
  console.log('🔔 Testing Discord Webhook Alert...\n');
  const dummyJob = {
    title: 'Full Stack Engineer (Node.js / React)',
    company: 'Stripe',
    location: 'Remote (India / Global)',
    url: 'https://stripe.com/jobs',
    source: 'greenhouse',
    tier: 'mnc',
    isRemote: true,
    matchScore: 92,
    techStack: ['Node.js', 'React', 'TypeScript', 'PostgreSQL', 'Docker'],
    snippet: 'We are looking for a Full Stack Engineer to join our core infrastructure and payments team.'
  };

  const ok = await discordService.sendJobAlert(dummyJob);
  if (ok) {
    console.log('\n🎉 Success! Check your Discord channel for the rich card.');
  } else {
    console.log('\nℹ️ Make sure DISCORD_WEBHOOK_URL is set in your .env file.');
  }
}

test();
