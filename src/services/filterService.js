const config = require('../config');
const keywordPattern = value => new RegExp(`(?:^|[^a-z0-9])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'i');

class FilterService {
  /**
   * Extracts and validates experience level from job text and title.
   * STRICT REQUIREMENT: 0 to 2 years, maximum 3 years.
   */
  checkExperience(title, snippet) {
    const text = `${title} ${snippet}`.toLowerCase();

    // 1. Strict Senior / High-level Title Exclusions
    const seniorTitleRegex = /\b(senior|sr\b|sr\.|staff|principal|lead|architect|director|manager|head of|vp|sde 3|sde iii|sde-3|sde-iii|engineer iii|engineer iv|l5|l6|e5|e6)\b/i;
    if (seniorTitleRegex.test(title)) {
      return { allowed: false, expLabel: 'Senior / Staff / Lead Level (Excluded)', reason: 'Senior title' };
    }

    // Match the minimum required experience, rather than a range's upper bound.
    const requirements = text.matchAll(/(?<![\d.])\b(\d{1,2}(?:\.\d+)?)(?:\s*(?:-|\u2013|\u2014|to)\s*(\d{1,2}(?:\.\d+)?))?\s*\+?\s*(?:years?|yrs?)\b[^.;\n]{0,100}?\bexperience\b/gi);
    let reportedRequirement;
    for (const match of requirements) {
      if (Number(match[1]) > 3) return { allowed: false, expLabel: 'Above 3 years (Excluded)', reason: 'Requires ' + match[0] };
      if (!reportedRequirement || Number(match[1]) > Number(reportedRequirement[1])) reportedRequirement = match;
    }
    if (reportedRequirement) return { allowed: true,
      expLabel: reportedRequirement[0], reason: 'Source reports compatible minimum experience' };

    // 3. Detect Entry / Junior / Early Career Patterns (0 - 3 years)
    const earlyPatterns = [
      { regex: /\b(fresher|entry level|graduate|intern|internship|campus|trainee)\b/i, label: '0-1 Years (Fresher / Entry)' },
      { regex: /\b(0\s*(?:-|to)\s*1|0\s*(?:-|to)\s*2|1\s*(?:-|to)\s*2)\s*(?:years?|yrs?)\b/i, label: '0-2 Years' },
      { regex: /\b(1\s*(?:-|to)\s*3|0\s*(?:-|to)\s*3|2\s*(?:-|to)\s*3|3\s*years?|3\s*yrs?)\b/i, label: '1-3 Years (Max Target)' },
      { regex: /\b(associate|junior|jr\b|jr\.|sde 1|sde i|sde-1|sde-i|engineer 1|engineer i|l1|l2|l3)\b/i, label: 'Junior / Associate (1-2 Yrs)' }
    ];

    for (const pat of earlyPatterns) {
      if (pat.regex.test(pat.label.includes('Fresher') || pat.label.includes('Junior') ? title : text)) {
        return { allowed: true, expLabel: pat.label, reason: 'Matched early career criteria' };
      }
    }

    // Default: If title is generic "Software Engineer" / "Full Stack Developer" without senior keywords
    return { allowed: true, expLabel: 'Experience not specified', reason: 'No explicit early-career requirement' };
  }

  /**
   * Evaluates job details against user's target filters
   */
  evaluate(job) {
    const eligibility = require('./candidateEligibility').assess(job);
    if (eligibility) return eligibility;
    const title = (job.title || '').toLowerCase();
    const location = (job.location || '').toLowerCase();
    const snippet = (job.snippet || '').toLowerCase();
    const content = `${title} ${snippet} ${location}`;

    // 1. Strict Experience Filter (0 - 2 yrs, max 3 yrs)
    const requirements = job.requiredQualifications ?? require('../scrapers/utils').sections(snippet).requiredQualifications;
    const expResult = this.checkExperience(title, requirements);
    if (!expResult.allowed) {
      return { matched: false, reason: `Excluded by experience: ${expResult.reason}` };
    }

    // 2. Strict Java / .NET / C# Exclusion
    const javaRegex = /(?:\b(?:java(?!\s*script)|j2ee|spring|springboot|csharp|cobol)\b|(?:^|[^a-z0-9])(?:\.net|c#)(?=$|[^a-z0-9]))/i;
    const alternativeStack = /\b(?:javascript|typescript|react(?:js)?|node(?:js)?|python)\b|node\.js|react\.js/i.test(snippet);
    if (javaRegex.test(title) || (javaRegex.test(snippet) && !alternativeStack)) {
      return { matched: false, reason: 'Excluded: Java / .NET / C# role' };
    }

    // Negative Keyword Check
    for (const neg of config.filters.negativeKeywords) {
      const regex = keywordPattern(neg);
      if (regex.test(title)) {
        return { matched: false, reason: `Excluded by negative keyword: "${neg}"` };
      }
    }

    // 3. Role Title Check
    let roleMatched = false;
    for (const role of config.filters.targetRoles) {
      const roleAliases = {
        'software engineer': ['software engineer', 'software development engineer'],
        'software developer': ['software developer', 'application developer'],
        'full stack': ['full stack', 'full-stack', 'fullstack'],
        'frontend': ['frontend', 'front-end', 'front end'],
        'backend': ['backend', 'back-end', 'back end']
      };
      if ((roleAliases[role] || [role]).some(value => keywordPattern(value).test(title))) {
        roleMatched = true;
        break;
      }
    }

    if (!roleMatched && config.filters.targetRoles.length) return { matched: false, reason: 'Role outside preferences' };

    // 4. Strict Location Gate (Remote, Mumbai, Bengaluru, Hyderabad, Noida, Delhi NCR)
    const isRemote = job.isRemote ||
      location.includes('remote') ||
      location.includes('work from home') ||
      location.includes('wfh') ||
      title.includes('remote') ||
      content.includes('work from anywhere');

    const prefs = config.filters;
    const mode = require('./jobDetails')(job);
    if (mode.salaryMin == null && prefs.includeUnknownSalary === false) return { matched: false, reason: 'Salary unknown' };
    if (mode.workMode === 'remote' && prefs.remoteScope === 'india' && (mode.remoteEligibility === 'restricted' || (mode.remoteEligibility === 'unknown' && !prefs.includeUnknownRemote))) return { matched: false, reason: 'Remote eligibility outside preferences' };
    if (prefs.workModes && !prefs.workModes.includes(mode.workMode)) return { matched: false, reason: 'Work mode excluded' };
    if (prefs.salaryMin != null || prefs.salaryMax != null) {
      if (mode.salaryMin == null) { if (!prefs.includeUnknownSalary) return { matched: false, reason: 'Salary unknown' }; }
      else if (mode.salaryCurrency !== prefs.salaryCurrency || mode.salaryPeriod !== prefs.salaryPeriod || (prefs.salaryMin != null && mode.salaryMax < prefs.salaryMin) || (prefs.salaryMax != null && mode.salaryMin > prefs.salaryMax)) return { matched: false, reason: 'Salary outside preferences' };
    }
    let locationMatched = isRemote;
    let normalizedLocation = isRemote ? 'Remote' : '';

    if (!locationMatched) {
      if (location.includes('mumbai') || location.includes('navi mumbai') || location.includes('thane')) {
        locationMatched = true;
        normalizedLocation = 'Mumbai';
      } else if (location.includes('bengaluru') || location.includes('bangalore') || location.includes('blr')) {
        locationMatched = true;
        normalizedLocation = 'Bengaluru';
      } else if (location.includes('hyderabad') || location.includes('secunderabad') || location.includes('hyd')) {
        locationMatched = true;
        normalizedLocation = 'Hyderabad';
      } else if (location.includes('noida') || location.includes('greater noida')) {
        locationMatched = true;
        normalizedLocation = 'Noida';
      } else if (location.includes('delhi') || location.includes('new delhi') || location.includes('gurgaon') || location.includes('gurugram') || location.includes('ncr')) {
        locationMatched = true;
        normalizedLocation = 'Delhi NCR';
      } else if (location.includes('india') && !location.includes('indiana')) {
        // Multi-city or Pan-India opening
        locationMatched = true;
        normalizedLocation = 'India';
      }
    }

    if (!locationMatched && config.filters.targetLocations.some(value => value !== 'remote' && keywordPattern(value).test(location))) {
      locationMatched = true;
      normalizedLocation = job.location;
    }
    if (config.filters.targetLocations.length) {
      const aliases = { bengaluru: ['bengaluru', 'bangalore'], bangalore: ['bengaluru', 'bangalore'], mumbai: ['mumbai','thane'], delhi: ['delhi','noida','gurgaon','gurugram','ncr'], gurgaon: ['gurgaon','gurugram'] };
      const requested = config.filters.targetLocations.flatMap(city => aliases[city] || [city]);
      locationMatched = (isRemote && config.filters.targetLocations.includes('remote')) || requested.some(city => city !== 'remote' && keywordPattern(city).test(location));
    }
    // STRICT GATE: Exclude if not remote and not in target cities
    if (!locationMatched) {
      return {
        matched: false,
        reason: `Location "${location}" is outside target cities (Remote, Mumbai, Bengaluru, Hyderabad, Noida, Delhi)`
      };
    }

    // 5. Tech Stack Keyword Extraction
    const matchedSkills = [];
    for (const kw of config.filters.targetKeywords) {
      const kwRegex = keywordPattern(kw);
      if (kwRegex.test(content)) {
        matchedSkills.push(kw);
      }
    }

    if (config.filters.targetKeywords.length && !matchedSkills.length) {
      return { matched: false, reason: 'No preferred tech stack found in source details' };
    }

    // 6. Calculate Match Score (0 - 100)
    let score = 0;
    if (roleMatched) score += 35;
    if (locationMatched) score += 20;
    if (isRemote) score += 15;

    // Up to 30 points for matching tech stack skills
    const skillPoints = Math.min(30, matchedSkills.length * 6);
    score += skillPoints;

    const matched = score >= config.filters.minMatchScore;

    return {
      matched,
      score,
      isRemote,
      normalizedLocation: normalizedLocation || 'Remote',
      experienceLevel: expResult.expLabel,
      matchedSkills,
      reason: matched ? 'Meets match criteria' : `Low score (${score}/${config.filters.minMatchScore})`
    };
  }

  assess(job) {
    const result = this.evaluate(job);
    if (result.review) return result;
    const reasons = [];
    if (result.matchedSkills?.length) reasons.push(`Skills: ${result.matchedSkills.join(', ')}`);
    if (result.normalizedLocation) reasons.push(`Location: ${job.location}`);
    if (result.experienceLevel) reasons.push(`Experience: ${result.experienceLevel}`);
    if (!result.matched) {
      const insufficient = result.reason === 'No preferred tech stack found in source details' &&
        (job.detailsComplete === false || (job.snippet || '').length < 80);
      return { ...result, matchQuality: insufficient ? 'insufficient-details' : 'excluded',
        review: insufficient, matchReasons: [result.reason] };
    }
    const unknown = result.experienceLevel === 'Experience not specified' || job.detailsComplete === false;
    const matchQuality = !unknown && result.score >= 70 ? 'strong' : 'possible';
    if (unknown) reasons.push('Confirm missing requirements on the employer page');
    return { ...result, matchQuality, matchReasons: reasons };
  }
}

module.exports = new FilterService();
