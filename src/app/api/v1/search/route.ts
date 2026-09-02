import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getQueryEmbedding, getEmbeddingColumn } from '@/lib/server/embeddingRouter';
import { executeHybridRetrieval } from '@/lib/server/hybridRetrieval';

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
      top_k = 10,
    } = body;

    if (!queryText) {
      return NextResponse.json({ detail: 'Query is required' }, { status: 400 });
    }

    const topK = top_k || 10;

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

    const retrievalResult = await executeHybridRetrieval({
      queryText,
      queryVector: queryEmbedding,
      scope: {
        stream: studentStream && studentStream !== 'All' ? studentStream : undefined,
        semester: studentSem && studentSem !== 'All' ? studentSem : undefined,
        section: studentSection && studentSection !== 'All' ? studentSection : undefined,
        subject: reqSubject && reqSubject !== 'All Subjects' ? reqSubject : undefined,
        fileName: reqFileName || undefined,
        documentId: reqDocId || undefined,
      },
      vectorLimit: 25,
      keywordLimit: 15,
      topK,
      embeddingCol: embCol,
    });

    const searchResults = retrievalResult.chunks.map((c) => ({
      ...c,
      score: c.similarity,
    }));

    return NextResponse.json({
      results: searchResults,
      query: queryText,
      total_found: searchResults.length,
      retrieval_mode: 'hybrid_rrf_reranked',
      metrics: retrievalResult.metrics,
    });
  } catch (err: any) {
    console.error('Search endpoint error:', err);
    return NextResponse.json({ detail: err.message || 'Search error' }, { status: 500 });
  }
}
