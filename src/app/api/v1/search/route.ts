import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query, initDbSchema } from '@/lib/server/db';
import { getEmbedding, formatVector } from '@/lib/server/embeddings';

const SIMILARITY_THRESHOLD = 0.3;

export async function POST(req: NextRequest) {
  try {
    await initDbSchema();
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      query: queryText,
      subject: reqSubject,
      stream: reqStream,
      semester: reqSem,
      top_k,
    } = body;

    if (!queryText) {
      return NextResponse.json({ detail: 'Query is required' }, { status: 400 });
    }

    const topK = top_k || parseInt(process.env.RETRIEVAL_TOP_K || '5', 10);

    // Parallel: embedding + student profile lookup
    const [queryEmbedding, studentRes] = await Promise.all([
      getEmbedding(queryText),
      query('SELECT stream, sem FROM student_users WHERE id = $1;', [user.uid]).catch(() => ({
        rowCount: 0,
        rows: [],
      })),
    ]);

    let studentStream = reqStream;
    let studentSem = reqSem;
    if (studentRes.rowCount && studentRes.rowCount > 0) {
      const profile = studentRes.rows[0] as any;
      studentStream = studentStream || profile.stream;
      studentSem = studentSem || profile.sem;
    }

    const vectorStr = formatVector(queryEmbedding);

    let sql = `
      SELECT id, document_id, chunk_index, total_chunks, raw_content as text,
             page_start, page_end, source, title, stream, semester, subject, module,
             1 - (embedding <=> $1) AS score
      FROM document_chunks
      WHERE embedding IS NOT NULL
    `;
    const params: any[] = [vectorStr];
    let pIdx = 2;

    if (studentStream && studentStream !== 'All') {
      sql += ` AND (stream = $${pIdx} OR stream = 'General' OR stream IS NULL)`;
      params.push(studentStream);
      pIdx++;
    }
    if (studentSem && studentSem !== 'All') {
      sql += ` AND (semester = $${pIdx} OR semester = 'General' OR semester IS NULL)`;
      params.push(studentSem);
      pIdx++;
    }
    if (reqSubject && reqSubject !== 'All Subjects') {
      sql += ` AND (LOWER(subject) = LOWER($${pIdx}) OR subject = 'General' OR subject IS NULL)`;
      params.push(reqSubject);
      pIdx++;
    }

    sql += ` ORDER BY embedding <=> $1 LIMIT $${pIdx};`;
    params.push(topK);

    const res = await query(sql, params);
    const filtered = res.rows.filter((r) => r.score > SIMILARITY_THRESHOLD);

    return NextResponse.json({
      results: filtered.map((r) => ({
        chunk_id: r.id,
        document_id: r.document_id,
        text: r.text,
        score: parseFloat(r.score.toFixed(4)),
        metadata: {
          title: r.title,
          source: r.source,
          stream: r.stream,
          semester: r.semester,
          subject: r.subject,
          module: r.module,
          page_start: r.page_start,
          page_end: r.page_end,
        },
      })),
      total: filtered.length,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
