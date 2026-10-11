const db = require('./db/database');

function cleanJobs() {
  const stmt = db.db.prepare(`
    DELETE FROM jobs 
    WHERE LOWER(title) LIKE '%java%' 
       OR LOWER(title) LIKE '%.net%' 
       OR LOWER(title) LIKE '%spring%'
       OR LOWER(title) LIKE '%c#%'
       OR LOWER(title) LIKE '%cobol%'
  `);

  const res = stmt.run();
  console.log(`🧹 Removed ${res.changes} Java / .NET / C# jobs from database.`);
  console.log('📊 Clean Database Stats:', db.getStats());
}

cleanJobs();
