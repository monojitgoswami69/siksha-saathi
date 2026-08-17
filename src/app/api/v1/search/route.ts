import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getEmbedding, formatVector } from '@/lib/server/embeddings';

const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.25');

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
    const cleanSearchText = queryText.replace(/[^\w\s]/gi, ' ').trim() || queryText;

    let whereFilter = 'WHERE c.embedding IS NOT NULL';
    const params: any[] = [vectorStr, cleanSearchText];
    let pIdx = 3;

    if (studentStream && studentStream !== 'All') {
      whereFilter += ` AND (c.stream = $${pIdx} OR c.stream = 'General' OR c.stream IS NULL)`;
      params.push(studentStream);
      pIdx++;
    }
    if (studentSem && studentSem !== 'All') {
      whereFilter += ` AND (c.semester = $${pIdx} OR c.semester = 'General' OR c.semester IS NULL)`;
      params.push(studentSem);
      pIdx++;
    }
    if (reqSubject && reqSubject !== 'All Subjects') {
      whereFilter += ` AND (LOWER(c.subject) = LOWER($${pIdx}) OR c.subject = 'General' OR c.subject IS NULL)`;
      params.push(reqSubject);
      pIdx++;
    }

    const hybridSql = `
      WITH vector_search AS (
        SELECT 
          c.id,
          ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1) AS v_rank,
          (1 - (c.embedding <=> $1)) AS v_sim
        FROM document_chunks c
        ${whereFilter}
        LIMIT 25
      ),
      text_search AS (
        SELECT 
          c.id,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', c.raw_content), plainto_tsquery('english', $2)) DESC) AS t_rank,
          ts_rank_cd(to_tsvector('english', c.raw_content), plainto_tsquery('english', $2)) AS t_score
        FROM document_chunks c
        ${whereFilter} AND to_tsvector('english', c.raw_content) @@ plainto_tsquery('english', $2)
        LIMIT 25
      )
      SELECT 
        c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content AS text,
        c.page_start, c.page_end, c.source, c.title, c.stream, c.semester, c.subject, c.module,
        COALESCE(v.v_sim, 0) AS score,
        COALESCE(t.t_score, 0) AS text_score,
        (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + t.t_rank), 0.0)) AS rrf_score
      FROM document_chunks c
      LEFT JOIN vector_search v ON c.id = v.id
      LEFT JOIN text_search t ON c.id = t.id
      WHERE v.id IS NOT NULL OR t.id IS NOT NULL
      ORDER BY rrf_score DESC, score DESC
      LIMIT $${pIdx};
    `;
    params.push(topK);

    let searchResults: any[] = [];
    try {
      const res = await query(hybridSql, params);
      searchResults = res.rows.filter((r) => r.score > SIMILARITY_THRESHOLD || r.text_score > 0.05);
    } catch (e: any) {
      console.warn('Hybrid search fallback:', e.message);
      const fallbackRes = await query(
        `SELECT id, document_id, chunk_index, total_chunks, raw_content AS text,
                page_start, page_end, source, title, stream, semester, subject, module,
                1 - (embedding <=> $1) AS score
         FROM document_chunks
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1 LIMIT $2;`,
        [vectorStr, topK]
      );
      searchResults = fallbackRes.rows.filter((r) => r.score > SIMILARITY_THRESHOLD);
    }

    return NextResponse.json({
      results: searchResults,
      query: queryText,
      total_found: searchResults.length,
      retrieval_mode: 'hybrid_rrf',
    });
  } catch (err: any) {
    console.error('Search endpoint error:', err);
    return NextResponse.json({ detail: err.message || 'Search error' }, { status: 500 });
  }
}
