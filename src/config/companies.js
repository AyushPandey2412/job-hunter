/**
 * Curated directory of top tech companies & high-growth startups
 * mapped to their respective Applicant Tracking Systems (ATS) and Career APIs.
 */

module.exports = [
  // =========================================================================
  // 🇮🇳 INDIAN IT & MANUFACTURING GIANTS (Filtered strictly for 0-3 Yrs)
  // =========================================================================
  { name: 'Tata Consultancy Services (TCS)', token: 'tcs', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'Accenture India', token: 'accenture', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'Tata Motors', token: 'tata-motors', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'Infosys', token: 'infosys', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'Wipro', token: 'wipro', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'Cognizant', token: 'cognizant', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'HCLTech', token: 'hcl', ats: 'enterprise_india', tier: 'mnc' },
  { name: 'Tech Mahindra', token: 'tech-mahindra', ats: 'enterprise_india', tier: 'mnc' },

  // =========================================================================
  // 🏢 WORKDAY ENTERPRISE ATS (Global MNCs)
  // =========================================================================
  {
    name: 'Nvidia',
    token: 'nvidia',
    ats: 'workday',
    tier: 'mnc',
    workdayConfig: { host: 'nvidia.wd5.myworkdayjobs.com', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite' }
  },
  {
    name: 'Adobe',
    token: 'adobe',
    ats: 'workday',
    tier: 'mnc',
    workdayConfig: { host: 'adobe.wd5.myworkdayjobs.com', tenant: 'adobe', site: 'external_experienced' }
  },
  {
    name: 'Intel',
    token: 'intel',
    ats: 'workday',
    tier: 'mnc',
    workdayConfig: { host: 'intel.wd1.myworkdayjobs.com', tenant: 'intel', site: 'External' }
  },
  {
    name: 'Target',
    token: 'target',
    ats: 'workday',
    tier: 'mnc',
    workdayConfig: { host: 'target.wd5.myworkdayjobs.com', tenant: 'target', site: 'targetcareers' }
  },
  {
    name: 'Autodesk',
    token: 'autodesk',
    ats: 'workday',
    tier: 'mnc',
    workdayConfig: { host: 'autodesk.wd1.myworkdayjobs.com', tenant: 'autodesk', site: 'Ext' }
  },

  // =========================================================================
  // 🏢 SMARTRECRUITERS ENTERPRISE ATS
  // =========================================================================
  { name: 'Bosch Group', token: 'BoschGroup', ats: 'smartrecruiters', tier: 'mnc' },

  // =========================================================================
  // 🚀 GREENHOUSE COMPANIES (MNCs & High-Growth Startups)
  // =========================================================================
  { name: 'Stripe', token: 'stripe', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Airbnb', token: 'airbnb', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Figma', token: 'figma', ats: 'greenhouse', tier: 'startup' },
  { name: 'Vercel', token: 'vercel', ats: 'greenhouse', tier: 'startup' },
  { name: 'Supabase', token: 'supabase', ats: 'greenhouse', tier: 'startup' },
  { name: 'Discord', token: 'discord', ats: 'greenhouse', tier: 'startup' },
  { name: 'GitLab', token: 'gitlab', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Postman', token: 'postman', ats: 'greenhouse', tier: 'startup' },
  { name: 'Datadog', token: 'datadog', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Cloudflare', token: 'cloudflare', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Reddit', token: 'reddit', ats: 'greenhouse', tier: 'mnc' },
  { name: 'DoorDash', token: 'doordash', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Pinterest', token: 'pinterest', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Twilio', token: 'twilio', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Cockroach Labs', token: 'cockroachlabs', ats: 'greenhouse', tier: 'startup' },
  { name: 'Sourcegraph', token: 'sourcegraph', ats: 'greenhouse', tier: 'startup' },
  { name: 'Sentry', token: 'sentry', ats: 'greenhouse', tier: 'startup' },
  { name: 'Docker', token: 'docker', ats: 'greenhouse', tier: 'startup' },
  { name: 'HashiCorp', token: 'hashicorp', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Instacart', token: 'instacart', ats: 'greenhouse', tier: 'mnc' },
  { name: 'Notion', token: 'notion', ats: 'greenhouse', tier: 'startup' },
  { name: 'Razorpay', token: 'razorpaysoftwareprivatelimited', ats: 'greenhouse', tier: 'startup' },

  // =========================================================================
  // 🚀 LEVER COMPANIES
  // =========================================================================
  { name: 'Netflix', token: 'netflix', ats: 'lever', tier: 'mnc' },
  { name: 'Spotify', token: 'spotify', ats: 'lever', tier: 'mnc' },
  { name: 'Shopify', token: 'shopify', ats: 'lever', tier: 'mnc' },
  { name: 'Canva', token: 'canva', ats: 'lever', tier: 'startup' },
  { name: 'Palantir', token: 'palantir', ats: 'lever', tier: 'mnc' },
  { name: 'Atlassian', token: 'atlassian', ats: 'lever', tier: 'mnc' },
  { name: 'Ramp', token: 'ramp', ats: 'lever', tier: 'startup' },
  { name: 'Temporal', token: 'temporal', ats: 'lever', tier: 'startup' },

  // =========================================================================
  // 🤖 ASHBY COMPANIES (AI Startups)
  // =========================================================================
  { name: 'OpenAI', token: 'openai', ats: 'ashby', tier: 'startup' },
  { name: 'Anthropic', token: 'anthropic', ats: 'ashby', tier: 'startup' },
  { name: 'Linear', token: 'linear', ats: 'ashby', tier: 'startup' },
  { name: 'Retool', token: 'retool', ats: 'ashby', tier: 'startup' },
  { name: 'Perplexity', token: 'perplexity', ats: 'ashby', tier: 'startup' },
  { name: 'Replit', token: 'replit', ats: 'ashby', tier: 'startup' },
  { name: 'Cursor / Anysphere', token: 'anysphere', ats: 'ashby', tier: 'startup' },
  { name: 'Weights & Biases', token: 'wandb', ats: 'ashby', tier: 'startup' },
  { name: 'Cohere', token: 'cohere', ats: 'ashby', tier: 'startup' },
  { name: 'Pinecone', token: 'pinecone', ats: 'ashby', tier: 'startup' },
  { name: 'Together AI', token: 'together-ai', ats: 'ashby', tier: 'startup' }
];
