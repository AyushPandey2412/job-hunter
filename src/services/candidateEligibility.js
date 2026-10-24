const core = /\b(?:javascript|typescript|react(?:js)?|nextjs|nodejs)\b|\b(?:node|next|react)\.js\b/i;
const excluded = /\b(?:java(?!\s*script)|spring(?:boot)?|csharp|asp\.net)\b|(?:^|[^a-z0-9])(?:\.net|c#)(?=$|[^a-z0-9])/i;
const senior = /\b(?:senior|sr|staff|principal|lead|architect|director|manager|head|vp)\b|\b(?:sde|engineer)\s*[- ]?(?:ii|iii|iv|[2-9])\b/i;
function experience(title, text) {
  const evidence = [];
  for (const sentence of String(text).split(/[;\n]|(?<=[a-z])\.\s+/i)) {
    if (/preferred|nice.to.have|desirable/i.test(sentence)) continue;
    if (!/experience|minimum|at least|required|must have/i.test(sentence)) continue;
    const matches = sentence.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:[-–—]|to)?\s*(\d+(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)\b/gi);
    for (const m of matches) evidence.push({ minimum: Number(m[1]), text: sentence.trim() });
  }
  const minimum = evidence.length ? Math.max(...evidence.map(e => e.minimum)) : null;
  return { minimum, evidence };
}
function assess(job, now = new Date()) {
  const title = job.title || '';
  const text = String(job.snippet || job.description || '');
  const required = String(job.requiredQualifications ?? text.split(/preferred qualifications|nice.to.have|preferred experience/i)[0]);
  const reject = reason => ({ matched:false,review:false,matchQuality:'excluded',reason,matchReasons:[reason] });
  if (senior.test(title)) return reject('Senior or mid-level title outside junior target');
  const location = String(job.location || '');
  if (!/\b(?:mumbai|pune|thane|navi mumbai)\b/i.test(location)) return reject('Location must explicitly include Mumbai or Pune (Mumbai metro includes Thane/Navi Mumbai)');
  if (excluded.test(title)) return reject('Primary role targets Java/.NET/C#');
  for (const clause of required.split(/[;\n]|(?<=[a-z])\.\s+/i)) {
    if (excluded.test(clause) && !/optional|nice.to.have|preferred/i.test(clause)) {
      // A genuine alternative such as React OR Java is not a mandatory Java role.
      if (!(/\bor\b/i.test(clause) && core.test(clause))) return reject('Required stack includes Java/.NET/C#');
    }
  }
  const exp = experience(title,required);
  const months = (now.getFullYear()-2025)*12 + now.getMonth()-8;
  const years = Math.max(0,months/12);
  if (exp.minimum !== null && exp.minimum > years) return reject(`Required minimum ${exp.minimum} years exceeds dated experience (${months} completed calendar months)`);
  if (!core.test(title+' '+required)) return reject('No core JavaScript/TypeScript/React/Next.js/Node.js evidence');
  if (exp.minimum === null || job.detailsComplete === false || required.trim().length < 40) {
    const reason='Experience or full requirements need review; not eligible for automatic alerts/applications';
    return {score:0,matchedSkills:[],normalizedLocation:location,matched:false,review:true,matchQuality:'insufficient-details',reason,matchReasons:[reason],experienceLevel:'Needs review'};
  }
  return null; // Pass to existing user-configurable salary, role, city and work-mode filters.
}
module.exports={assess,experience};
