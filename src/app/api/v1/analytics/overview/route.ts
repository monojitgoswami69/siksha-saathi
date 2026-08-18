import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope, queryLogScopeClause } from '@/lib/server/analyticsScope';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const scope = await resolveScope(user);

    // 1. Total queries (distinct query_logs, role-scoped)
    const totalBase = `FROM query_logs q WHERE 1=1`;
    const sc = queryLogScopeClause(scope, 1);
    const totalQRes = await query(`SELECT COUNT(*)::int as total ${totalBase}${sc.sql};`, sc.params);
    const totalQueries = totalQRes.rows[0]?.total || 0;

    // Total students (role-scoped)
    let studentSql = 'SELECT COUNT(*)::int as total FROM student_users s WHERE 1=1';
    const sParams: any[] = [];
    if (scope.mode === 'stream' && scope.stream) {
      studentSql += ` AND (s.stream = $1 OR s.stream = 'General')`;
      sParams.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      // students who queried this faculty's materials
      studentSql = `SELECT COUNT(DISTINCT q.user_id)::int as total FROM query_logs q
        JOIN query_citations qc ON qc.query_log_id = q.id
        JOIN documents d ON d.id = qc.document_id
        WHERE d.uploaded_by = $1 AND q.user_id IS NOT NULL`;
      sParams.push(scope.uid);
    }
    const totalSRes = await query(`${studentSql};`, sParams);
    const totalStudents = totalSRes.rows[0]?.total || 0;

    // 2. At-risk students (role-scoped)
    const atRiskRes = await query(
      `SELECT s.id, s.name, s.display_name, s.roll, COUNT(q.id)::int as total_queries,
              ARRAY_AGG(DISTINCT q.subject) as top_subjects
       FROM student_users s
       JOIN query_logs q ON s.id = q.user_id
       WHERE 1=1${sc.sql}
       GROUP BY s.id, s.name, s.display_name, s.roll
       ORDER BY total_queries DESC
       LIMIT 5;`,
      sc.params
    );

    const atRiskStudents = atRiskRes.rows.map((r: any) => ({
      id: r.id,
      name: r.name || r.display_name,
      roll: r.roll || 'N/A',
      total_queries: r.total_queries,
      top_subjects: (r.top_subjects || []).filter(Boolean).slice(0, 3),
    }));

    // 3. Weak domains — per subject, distinct queries that touched it (from query_citations)
    const weakRes = await query(
      `SELECT qc.subject, COUNT(DISTINCT qc.query_log_id)::int as query_count,
              ARRAY_AGG(DISTINCT COALESCE(s.name, s.display_name)) as struggling_students
       FROM query_citations qc
       LEFT JOIN query_logs q ON q.id = qc.query_log_id
       LEFT JOIN student_users s ON q.user_id = s.id
       WHERE qc.subject IS NOT NULL AND qc.subject != 'General' AND qc.subject != ''
       ${scope.mode === 'stream' && scope.stream ? ` AND (qc.stream = $1 OR qc.stream = 'General' OR qc.stream IS NULL)` : ''}
       ${scope.mode === 'faculty' ? ` AND qc.document_id IN (SELECT id FROM documents WHERE uploaded_by = $1)` : ''}
       GROUP BY qc.subject
       ORDER BY query_count DESC
       LIMIT 5;`,
      scope.mode === 'all' ? [] : [scope.stream || scope.uid]
    );

    const weakDomains = weakRes.rows.map((r: any) => {
      const proficiency = Math.max(30, Math.min(95, 100 - r.query_count * 5));
      return {
        subject: r.subject,
        proficiency,
        query_count: r.query_count,
        struggling_students: (r.struggling_students || []).filter(Boolean).slice(0, 3),
      };
    });

    // 4. Weekly trend (role-scoped)
    const weeklyData: Array<{ date: string; queries: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const res = await query(
        `SELECT COUNT(*)::int as count FROM query_logs q
         WHERE q.created_at >= $1::timestamp AND q.created_at < ($1::timestamp + INTERVAL '1 day')${sc.sql};`,
        [dateStr, ...sc.params]
      );
      weeklyData.push({ date: displayDate, queries: res.rows[0]?.count || 0 });
    }

    const streamLabel = scope.mode === 'stream' && scope.stream ? scope.stream.toUpperCase() : 'ALL';

    return NextResponse.json({
      total_queries: totalQueries,
      total_students: totalStudents,
      at_risk_students: atRiskStudents,
      at_risk_count: atRiskStudents.length,
      weak_domains: weakDomains,
      weekly_data: weeklyData,
      stream: streamLabel,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
