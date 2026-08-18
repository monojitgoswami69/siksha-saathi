import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope } from '@/lib/server/analyticsScope';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const semester = searchParams.get('semester') || searchParams.get('sem');
    const scope = await resolveScope(user);

    // ---- Chunk counts per subject (role-scoped) ----
    const chunkParams: any[] = [];
    let chunkSql = `SELECT subject, COUNT(*)::int as chunk_count FROM document_chunks c WHERE subject IS NOT NULL AND subject != ''`;
    if (scope.mode === 'stream' && scope.stream) {
      chunkSql += ` AND (c.stream = $1 OR c.stream = 'General' OR c.stream IS NULL)`;
      chunkParams.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      chunkSql += ` AND c.document_id IN (SELECT id FROM documents WHERE uploaded_by = $1)`;
      chunkParams.push(scope.uid);
    }
    if (semester && semester !== 'All') {
      chunkSql += ` AND c.semester = $${chunkParams.length + 1}`;
      chunkParams.push(semester);
    }
    chunkSql += ` GROUP BY subject;`;
    const chunkRes = await query(chunkSql, chunkParams);

    const chunkMap = new Map<string, number>();
    chunkRes.rows.forEach((r: any) => chunkMap.set(r.subject.toLowerCase(), r.chunk_count));

    // ---- Query counts per subject (distinct queries that touched it, from query_citations) ----
    const qParams: any[] = [];
    let qSql = `SELECT qc.subject,
          COUNT(DISTINCT qc.query_log_id)::int as query_count,
          COUNT(DISTINCT q.user_id)::int as student_count
       FROM query_citations qc
       LEFT JOIN query_logs q ON q.id = qc.query_log_id
       WHERE qc.subject IS NOT NULL AND qc.subject != '' AND qc.subject != 'General'`;
    if (scope.mode === 'stream' && scope.stream) {
      qSql += ` AND (qc.stream = $1 OR qc.stream = 'General' OR qc.stream IS NULL)`;
      qParams.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      qSql += ` AND qc.document_id IN (SELECT id FROM documents WHERE uploaded_by = $1)`;
      qParams.push(scope.uid);
    }
    if (semester && semester !== 'All') {
      qSql += ` AND qc.semester = $${qParams.length + 1}`;
      qParams.push(semester);
    }
    qSql += ` GROUP BY qc.subject;`;
    const queryRes = await query(qSql, qParams);

    const subjects: any[] = [];
    const allSubjects = new Set([
      ...chunkRes.rows.map((r: any) => r.subject),
      ...queryRes.rows.map((r: any) => r.subject),
    ]);

    allSubjects.forEach((subj) => {
      const cleanSubj = subj.trim();
      const qRow = queryRes.rows.find((r: any) => r.subject.toLowerCase() === cleanSubj.toLowerCase());
      const queryCount = qRow?.query_count || 0;
      const chunkCount = chunkMap.get(cleanSubj.toLowerCase()) || 0;
      const studentCount = qRow?.student_count || 0;
      const density = chunkCount > 0 ? queryCount / chunkCount : 0;
      const proficiency = Math.max(35, Math.min(95, Math.round(95 - density * 8)));
      subjects.push({
        subject: cleanSubj,
        total_queries: queryCount,
        chunk_count: chunkCount,
        student_count: studentCount,
        query_density: parseFloat(density.toFixed(2)),
        proficiency_score: proficiency,
      });
    });
    subjects.sort((a, b) => b.total_queries - a.total_queries);

    // ---- Per-material heatmap (distinct queries touching each document) ----
    const mParams: any[] = [];
    let mSql = `SELECT d.id, d.title, d.file_name, d.subject,
          COUNT(DISTINCT qc.query_log_id)::int as query_count
       FROM documents d
       LEFT JOIN query_citations qc ON qc.document_id = d.id
       WHERE d.status = 'ready'`;
    if (scope.mode === 'stream' && scope.stream) {
      mSql += ` AND (d.stream = $1 OR d.stream = 'General' OR d.stream IS NULL)`;
      mParams.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      mSql += ` AND d.uploaded_by = $1`;
      mParams.push(scope.uid);
    }
    mSql += ` GROUP BY d.id, d.title, d.file_name, d.subject ORDER BY query_count DESC LIMIT 50;`;
    const matRes = await query(mSql, mParams);
    const materials = matRes.rows.map((r: any) => ({
      document_id: r.id,
      title: r.title,
      file_name: r.file_name,
      subject: r.subject,
      query_count: r.query_count,
    }));

    const totalQueries = subjects.reduce((a, b) => a + b.total_queries, 0);
    const targetStream =
      scope.mode === 'stream' && scope.stream
        ? scope.stream.toUpperCase()
        : scope.mode === 'faculty'
        ? 'MY MATERIALS'
        : 'ALL';

    return NextResponse.json({
      stream: targetStream,
      semester: semester || 'All Semesters',
      total_queries: totalQueries,
      subjects,
      materials,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
