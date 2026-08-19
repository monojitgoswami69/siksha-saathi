import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
env.split('\n').forEach(l=>{const t=l.trim();if(t&&!t.startsWith('#')&&t.includes('=')){const[k,...r]=t.split('=');process.env[k.trim()]=r.join('=').trim();}});
const p = new pg.Pool({connectionString:process.env.DATABASE_URL});
const r = await p.query('SELECT COUNT(*)::int as c FROM query_citations');
console.log(`citations:${r.rows[0].c}`);
await p.end();
