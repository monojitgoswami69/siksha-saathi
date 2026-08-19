import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
env.split('\n').forEach(l=>{const t=l.trim();if(t&&!t.startsWith('#')&&t.includes('=')){const[k,...r]=t.split('=');process.env[k.trim()]=r.join('=').trim();}});
const p = new pg.Pool({connectionString:process.env.DATABASE_URL});
const { GoogleGenerativeAI } = await import('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001' });
const dim = parseInt(process.env.GEMINI_EMBEDDING_DIM||'768');
const chunkRow = await p.query("SELECT raw_content, embedding::text FROM document_chunks LIMIT 1");
const chunkEmb = JSON.parse(chunkRow.rows[0].embedding);
const chunkText = chunkRow.rows[0].raw_content;
console.log("chunk text:", chunkText.slice(0,80));
// Query 1: exact chunk text (should be sim=1)
// Query 2: short semantic query
for (const q of [chunkText, "binary tree height", "what is a binary tree"]) {
  let r;
  try { r = await model.embedContent({ content:{parts:[{text:q}]}, outputDimensionality: dim, taskType: 'RETRIEVAL_QUERY' }); }
  catch(e){ r = await model.embedContent({ content:{parts:[{text:q}]}, outputDimensionality: dim }); }
  const qemb = r.embedding.values;
  // cosine sim
  let dot=0, na=0, nb=0;
  for (let i=0;i<qemb.length;i++){dot+=qemb[i]*chunkEmb[i];na+=qemb[i]*qemb[i];nb+=chunkEmb[i]*chunkEmb[i];}
  const cos = dot/(Math.sqrt(na)*Math.sqrt(nb));
  console.log(`q="${q.slice(0,30)}" cos_sim=${Math.round(cos*1000)/1000}`);
}
await p.end();
