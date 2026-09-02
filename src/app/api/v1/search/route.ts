import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getQueryEmbedding, formatVector, getEmbeddingColumn } from '@/lib/server/embeddingRouter';

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
      section: reqSection,
      file_name: reqFileName,
      document_id: reqDocId,
      top_k,
    } = body;

    if (!queryText) {
      return NextResponse.json({ detail: 'Query is required' }, { status: 400 });
    }

    const topK = top_k || parseInt(process.env.RETRIEVAL_TOP_K || '5', 10);

    const embCol = getEmbeddingColumn();
    const [queryEmbedding, studentRes] = await Promise.all([
      getQueryEmbedding(queryText),
      query('SELECT stream, sem, section FROM student_users WHERE id = $1;', [user.uid]).catch(
        () => ({ rowCount: 0, rows: [] })
      ),
    ]);

    let studentStream = reqStream;
    let studentSem = reqSem;
    let studentSection = reqSection;
    if (studentRes.rowCount && studentRes.rowCount > 0) {
      const profile = studentRes.rows[0] as any;
      studentStream = studentStream || profile.stream;
      studentSem = studentSem || profile.sem;
      studentSection = studentSection || profile.section;
    }

    const vectorStr = formatVector(queryEmbedding);
    const cleanSearchText = queryText.replace(/[^\w\s]/gi, ' ').trim() || queryText;

    let whereFilter = `WHERE c.${embCol} IS NOT NULL`;
    const params: any[] = [];
    let pIdx = 1;

    if (studentStream && studentStream !== 'All') {
      whereFilter += ` AND (LOWER(c.stream) = LOWER($${pIdx}) OR c.stream = 'General' OR c.stream IS NULL)`;
      params.push(studentStream);
      pIdx++;
    }
    if (studentSem && studentSem !== 'All') {
      whereFilter += ` AND (c.semester = $${pIdx} OR c.semester = 'General' OR c.semester IS NULL)`;
      params.push(studentSem);
      pIdx++;
    }
    if (studentSection && studentSection !== 'All') {
      whereFilter += ` AND (LOWER(c.section) = LOWER($${pIdx}) OR c.section = 'General' OR c.section IS NULL)`;
      params.push(studentSection);
      pIdx++;
    }
    if (reqSubject && reqSubject !== 'All Subjects') {
      whereFilter += ` AND (LOWER(c.subject) = LOWER($${pIdx}) OR c.subject = 'General' OR c.subject IS NULL)`;
      params.push(reqSubject);
      pIdx++;
    }
    if (reqFileName) {
      whereFilter += ` AND LOWER(c.file_name) = LOWER($${pIdx})`;
      params.push(reqFileName);
      pIdx++;
    }
    if (reqDocId) {
      whereFilter += ` AND c.document_id = $${pIdx}`;
      params.push(reqDocId);
      pIdx++;
    }

    const hybridParams: any[] = [vectorStr, cleanSearchText, ...params];
    const scopeClauseForHybrid = whereFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + 2}`);

    const hybridSql = `
      WITH vector_search AS (
        SELECT
          c.id,
          ROW_NUMBER() OVER (ORDER BY c.${embCol} <=> $1) AS v_rank,
          (1 - (c.${embCol} <=> $1)) AS v_sim
        FROM document_chunks c
        ${scopeClauseForHybrid}
        LIMIT 25
      ),
      text_search AS (
        SELECT
          c.id,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('simple', c.raw_content), plainto_tsquery('simple', $2)) DESC) AS t_rank,
          ts_rank_cd(to_tsvector('simple', c.raw_content), plainto_tsquery('simple', $2)) AS t_score
        FROM document_chunks c
        ${scopeClauseForHybrid} AND to_tsvector('simple', c.raw_content) @@ plainto_tsquery('simple', $2)
        LIMIT 25
      )
      SELECT
        c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content AS text,
        c.page_start, c.page_end, c.paragraph_id, c.chunk_type, c.char_start, c.char_end,
        c.file_name, c.title, c.stream, c.semester, c.section, c.subject, c.module,
        COALESCE(v.v_sim, 0) AS score,
        COALESCE(t.t_score, 0) AS text_score,
        (COALESCE(1.0 / (60 + v.v_rank), 0.0) + COALESCE(1.0 / (60 + t.t_rank), 0.0)) AS rrf_score
      FROM document_chunks c
      LEFT JOIN vector_search v ON c.id = v.id
      LEFT JOIN text_search t ON c.id = t.id
      WHERE v.id IS NOT NULL OR t.id IS NOT NULL
      ORDER BY rrf_score DESC, score DESC
      LIMIT $${params.length + 3}::int;
    `;
    hybridParams.push(topK);

    let searchResults: any[] = [];
    try {
      const res = await query(hybridSql, hybridParams);
      searchResults = res.rows.filter((r) => r.score > SIMILARITY_THRESHOLD || r.text_score >= 0.05);
    } catch (e: any) {
      console.warn('Hybrid search fallback:', e.message);
      const fallbackScope = whereFilter.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + 1}`);
      const fallbackParams: any[] = [vectorStr, ...params, topK];
      const fallbackRes = await query(
        `SELECT id, document_id, chunk_index, total_chunks, raw_content AS text,
                page_start, page_end, paragraph_id, chunk_type, char_start, char_end,
                file_name, title, stream, semester, section, subject, module,
                1 - (c.${embCol} <=> $1) AS score
         FROM document_chunks c
         ${fallbackScope}
           ORDER BY c.${embCol} <=> $1 LIMIT $${params.length + 2}::int;`,
        fallbackParams
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
