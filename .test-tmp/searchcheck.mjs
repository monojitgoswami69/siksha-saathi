import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
env.split('\n').forEach(l=>{const t=l.trim();if(t&&!t.startsWith('#')&&t.includes('=')){const[k,...r]=t.split('=');process.env[k.trim()]=r.join('=').trim();}});
const p = new pg.Pool({connectionString:process.env.DATABASE_URL});
// get the chunk embedding as text
const c = await p.query("SELECT embedding::text FROM document_chunks LIMIT 1");
const emb = c.rows[0].embedding;
// vector distance + fts
const q = `
  SELECT id,
    1 - (embedding <=> $1) AS sim,
    ts_rank_cd(to_tsvector('simple', raw_content), plainto_tsquery('simple', $2)) AS tscore,
    to_tsvector('simple', raw_content) @@ plainto_tsquery('simple', $2) AS fts_match
  FROM document_chunks
`;
const r = await p.query(q, [emb, 'binary tree']);
console.log(JSON.stringify(r.rows, null, 2));
await p.end();
