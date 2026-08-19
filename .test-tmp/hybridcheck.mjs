import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
env.split('\n').forEach(l=>{const t=l.trim();if(t&&!t.startsWith('#')&&t.includes('=')){const[k,...r]=t.split('=');process.env[k.trim()]=r.join('=').trim();}});
const p = new pg.Pool({connectionString:process.env.DATABASE_URL});
// get query embedding via gemini
const { GoogleGenerativeAI } = await import('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001' });
const r = await model.embedContent({ content:{parts:[{text:'binary trees hierarchical'}]}, outputDimensionality: parseInt(process.env.GEMINI_EMBEDDING_DIM||'768'), taskType: 'RETRIEVAL_QUERY' });
const qemb = r.embedding.values;
const qstr = '['+qemb.join(',')+']';
const sql = `
  WITH vector_search AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1) AS v_rank, (1 - (c.embedding <=> $1)) AS v_sim
    FROM document_chunks c WHERE c.embedding IS NOT NULL LIMIT 25
  ),
  text_search AS (
    SELECT c.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', c.raw_content), plainto_tsquery('simple', $2)) DESC) AS t_rank,
      ts_rank_cd(to_tsvector('simple', c.raw_content), plainto_tsquery('simple', $2)) AS t_score
    FROM document_chunks c WHERE c.embedding IS NOT NULL AND to_tsvector('simple', c.raw_content) @@ plainto_tsquery('simple', $2)
    LIMIT 25
  )
  SELECT c.id, COALESCE(v.v_sim,0) AS sim, COALESCE(t.t_score,0) AS tscore,
    (to_tsvector('simple', c.raw_content) @@ plainto_tsquery('simple', $2)) AS fts_match
  FROM document_chunks c
  LEFT JOIN vector_search v ON c.id=v.id
  LEFT JOIN text_search t ON c.id=t.id
  WHERE v.id IS NOT NULL OR t.id IS NOT NULL
  LIMIT 5;
`;
const res = await p.query(sql, [qstr, 'binary trees hierarchical']);
console.log('rows:', res.rows.length);
for (const row of res.rows) console.log({id:row.id.slice(0,8), sim:Math.round(row.sim*1000)/1000, tscore:row.tscore, fts:row.fts_match});
await p.end();
