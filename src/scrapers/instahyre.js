const axios = require('axios');

class InstahyreScraper {
  /**
   * Fetches verified Indian tech startup & product company jobs from Instahyre API.
   * Scans target tech stacks (ReactJS, Node.js, Python, Frontend, Full Stack)
   * across target cities: Bangalore, Mumbai, Hyderabad, Noida, Delhi.
   */
  async fetchJobs() {
    const warnings = [];
    const skillsToSearch = ['ReactJS', 'Node.js', 'Python', 'Frontend', 'Full Stack'];
    const locationsToSearch = ['Bangalore', 'Mumbai', 'Hyderabad', 'Noida', 'Delhi'];
    const allJobs = [];
    const seenIds = new Set();

    // Rotate through skill and location combinations
    for (const skill of skillsToSearch) {
      for (const loc of locationsToSearch) {
        try {
          const res = await axios.get('https://www.instahyre.com/api/v1/job_search', {
            params: {
              skills: skill,
              locations: loc
            },
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            },
            timeout: 8000
          });

          const rawObjects = res.data?.objects || [];
          for (const item of rawObjects) {
            if (!item.id || seenIds.has(item.id)) continue;
            seenIds.add(item.id);

            const companyName = item.employer?.company_name || 'Tech Company';
            const title = item.title || item.candidate_title || '';
            const locationStr = item.locations || loc;
            const keywordsStr = Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
            const isRemote =
              locationStr.toLowerCase().includes('work from home') ||
              locationStr.toLowerCase().includes('remote') ||
              title.toLowerCase().includes('remote');

            allJobs.push({
              company: companyName,
              title: title.trim(),
              location: isRemote ? 'Remote' : locationStr,
              url: item.public_url || `https://www.instahyre.com/job-${item.id}`,
              source: 'instahyre',
              tier: 'startup',
              isRemote,
              snippet: `${title} at ${companyName} (${locationStr}). Tech Stack / Keywords: ${keywordsStr}. Company note: ${item.employer?.instahyre_note || ''}`,
              postedAt: item.reviewed_at ? new Date(item.reviewed_at).toISOString() : new Date().toISOString()
            });
          }
        } catch (err) {
          warnings.push(err.message);
          // Silent catch to allow remaining queries to proceed
          continue;
        }
      }
    }

    return {
      modified: true,
      warnings,
      jobs: allJobs
    };
  }
}

module.exports = new InstahyreScraper();
