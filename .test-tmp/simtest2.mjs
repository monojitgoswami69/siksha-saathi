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
function cosSim(a,b){let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return dot/(Math.sqrt(na)*Math.sqrt(nb));}
// embedContent with RETRIEVAL_DOCUMENT (same as chunk) for identical text
const r1 = await model.embedContent({ content:{parts:[{text:chunkText}]}, outputDimensionality: dim, taskType: 'RETRIEVAL_DOCUMENT' });
console.log("identical text, RETRIEVAL_DOCUMENT:", Math.round(cosSim(r1.embedding.values, chunkEmb)*1000)/1000);
// batchEmbedContents single, RETRIEVAL_DOCUMENT
const r2 = await (model).batchEmbedContents({ requests:[{ content:{parts:[{text:chunkText}]}, outputDimensionality: dim, taskType: 'RETRIEVAL_DOCUMENT' }] });
console.log("identical text, batchEmbedContents RETRIEVAL_DOCUMENT:", Math.round(cosSim(r2.embeddings[0].values, chunkEmb)*1000)/1000);
// NO taskType
const r3 = await model.embedContent({ content:{parts:[{text:chunkText}]}, outputDimensionality: dim });
console.log("identical text, no taskType:", Math.round(cosSim(r3.embedding.values, chunkEmb)*1000)/1000);
await p.end();
