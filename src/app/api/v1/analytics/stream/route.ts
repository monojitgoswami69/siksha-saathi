import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope, dashboardScopeClause } from '@/lib/server/analyticsScope';

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

    // Build all 3 scope clauses + SQL upfront
    const csc = dashboardScopeClause(
      { stream: 'c.stream', semester: 'c.semester', section: 'c.section', subject: 'c.subject' },
      scope,
      1
    );
    let chunkSql = `SELECT subject, COUNT(*)::int as chunk_count FROM document_chunks c WHERE subject IS NOT NULL AND subject != ''`;
    const chunkParams: any[] = [...csc.params];
    let cp = csc.nextIdx;
    if (semester && semester !== 'All') {
      chunkSql += ` AND c.semester = $${cp}`;
      chunkParams.push(semester);
      cp++;
    }
    chunkSql += `${csc.sql} GROUP BY subject;`;

    const qcs = dashboardScopeClause(
      { stream: 'qc.stream', semester: 'qc.semester', section: 'qc.section', subject: 'qc.subject' },
      scope,
      1
    );
    let qSql = `SELECT qc.subject,
          COUNT(DISTINCT qc.query_log_id)::int as query_count,
          COUNT(DISTINCT q.user_id)::int as student_count
       FROM query_citations qc
       LEFT JOIN query_logs q ON q.id = qc.query_log_id
       WHERE qc.subject IS NOT NULL AND qc.subject != '' AND qc.subject != 'General'`;
    const qParams: any[] = [...qcs.params];
    let qp = qcs.nextIdx;
    if (semester && semester !== 'All') {
      qSql += ` AND qc.semester = $${qp}`;
      qParams.push(semester);
      qp++;
    }
    qSql += `${qcs.sql} GROUP BY qc.subject;`;

    const msc = dashboardScopeClause(
      { stream: 'd.stream', semester: 'd.semester', section: 'd.section', subject: 'd.subject' },
      scope,
      2
    );
    let mSql = `SELECT d.id, d.title, d.file_name, d.subject,
          COUNT(DISTINCT qc.query_log_id)::int as query_count
       FROM documents d
       LEFT JOIN query_citations qc ON qc.document_id = d.id
       WHERE d.status = 'ready'${msc.sql}`;
    const mParams: any[] = [...msc.params];
    mSql += ` GROUP BY d.id, d.title, d.file_name, d.subject ORDER BY query_count DESC LIMIT 50;`;

    // Run all 3 queries in parallel (was sequential)
    const [chunkRes, queryRes, matRes] = await Promise.all([
      query(chunkSql, chunkParams),
      query(qSql, qParams),
      query(mSql, mParams),
    ]);

    const chunkMap = new Map<string, number>();
    chunkRes.rows.forEach((r: any) => chunkMap.set(r.subject.toLowerCase(), r.chunk_count));

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

    const materials = matRes.rows.map((r: any) => ({
      document_id: r.id,
      title: r.title,
      file_name: r.file_name,
      subject: r.subject,
      query_count: r.query_count,
    }));

    const totalQueries = subjects.reduce((a, b) => a + b.total_queries, 0);

    return NextResponse.json({
      stream: scope.mode === 'all' ? 'ALL' : 'ASSIGNED',
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
