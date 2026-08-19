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

    const scope = await resolveScope(user);

    // Build all scope clauses upfront
    const sc = dashboardScopeClause(
      { stream: 'q.stream', semester: 'q.semester', section: 'q.section', subject: 'q.subject' },
      scope,
      1
    );
    const ssc = dashboardScopeClause(
      { stream: 's.stream', semester: 's.sem', section: 's.section' },
      scope,
      1
    );
    const csc = dashboardScopeClause(
      { stream: 'qc.stream', semester: 'qc.semester', section: 'qc.section', subject: 'qc.subject' },
      scope,
      1
    );
    const wsc = dashboardScopeClause(
      { stream: 'q.stream', semester: 'q.semester', section: 'q.section', subject: 'q.subject' },
      scope,
      2
    );

    // Weekly trend — single GROUP BY instead of 7 sequential queries
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // Run ALL independent queries in parallel (was 11 sequential → now 5 parallel)
    const [totalQRes, totalSRes, atRiskRes, weakRes, weeklyRes] = await Promise.all([
      query(`SELECT COUNT(*)::int as total FROM query_logs q WHERE 1=1${sc.sql};`, sc.params),
      query(`SELECT COUNT(*)::int as total FROM student_users s WHERE 1=1${ssc.sql};`, ssc.params),
      query(
        `SELECT s.id, s.name, s.display_name, s.roll, COUNT(q.id)::int as total_queries,
                ARRAY_AGG(DISTINCT q.subject) as top_subjects
         FROM student_users s
         JOIN query_logs q ON s.id = q.user_id
         WHERE 1=1${sc.sql}
         GROUP BY s.id, s.name, s.display_name, s.roll
         ORDER BY total_queries DESC
         LIMIT 5;`,
        sc.params
      ),
      query(
        `SELECT qc.subject, COUNT(DISTINCT qc.query_log_id)::int as query_count,
                ARRAY_AGG(DISTINCT COALESCE(s2.name, s2.display_name)) as struggling_students
         FROM query_citations qc
         LEFT JOIN query_logs q2 ON q2.id = qc.query_log_id
         LEFT JOIN student_users s2 ON q2.user_id = s2.id
         WHERE qc.subject IS NOT NULL AND qc.subject != 'General' AND qc.subject != ''${csc.sql}
         GROUP BY qc.subject
         ORDER BY query_count DESC
         LIMIT 5;`,
        csc.params
      ),
      query(
        `SELECT DATE(q.created_at)::text as date, COUNT(*)::int as count
         FROM query_logs q
         WHERE q.created_at >= $1::timestamp${wsc.sql}
         GROUP BY DATE(q.created_at)
         ORDER BY DATE(q.created_at);`,
        [weekStart.toISOString(), ...wsc.params]
      ),
    ]);

    const totalQueries = totalQRes.rows[0]?.total || 0;
    const totalStudents = totalSRes.rows[0]?.total || 0;

    const atRiskStudents = atRiskRes.rows.map((r: any) => ({
      id: r.id,
      name: r.name || r.display_name,
      roll: r.roll || 'N/A',
      total_queries: r.total_queries,
      top_subjects: (r.top_subjects || []).filter(Boolean).slice(0, 3),
    }));

    const weakDomains = weakRes.rows.map((r: any) => ({
      subject: r.subject,
      proficiency: Math.max(30, Math.min(95, 100 - r.query_count * 5)),
      query_count: r.query_count,
      struggling_students: (r.struggling_students || []).filter(Boolean).slice(0, 3),
    }));

    // Build weekly data from GROUP BY result
    const countByDate = new Map<string, number>(
      weeklyRes.rows.map((r: any) => [r.date, r.count])
    );
    const now = new Date();
    const weeklyData: Array<{ date: string; queries: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      weeklyData.push({ date: displayDate, queries: countByDate.get(dateStr) || 0 });
    }

    return NextResponse.json({
      total_queries: totalQueries,
      total_students: totalStudents,
      at_risk_students: atRiskStudents,
      at_risk_count: atRiskStudents.length,
      weak_domains: weakDomains,
      weekly_data: weeklyData,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
