import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getEmbedding, formatVector } from '@/lib/server/embeddings';

const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.3');

export async function POST(req: NextRequest) {
  try {
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
    } = body;

    if (!queryText) {
      return NextResponse.json({ detail: 'Query is required' }, { status: 400 });
    }

    const topK = parseInt(process.env.RETRIEVAL_TOP_K || '5', 10);

    // Parallel: generate embedding + lookup student profile
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
      SELECT id, document_id, raw_content, title, source, subject, module,
             page_start, page_end, stream, semester,
             1 - (embedding <=> $1) as similarity
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
    const filtered = res.rows.filter((r) => r.similarity > SIMILARITY_THRESHOLD);

    const sources = filtered.map((r) => ({
      title: r.title || r.source,
      source: r.source,
      subject: r.subject || 'General',
      module: r.module || undefined,
      page: r.page_start || undefined,
      similarity: parseFloat((r.similarity || 0).toFixed(3)),
    }));

    const context = filtered.map((r) => r.raw_content).join('\n\n');

    return NextResponse.json({
      answer: context
        ? `Here is information on "${queryText}" based on your course materials.`
        : `No relevant course materials found for "${queryText}" in your enrolled syllabus.`,
      sources,
      context_used: filtered.length,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
