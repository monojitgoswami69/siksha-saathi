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

    // 1. Weekly data — single query with GROUP BY instead of 7 sequential queries
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const wsc = dashboardScopeClause(
      { stream: 'q.stream', semester: 'q.semester', section: 'q.section', subject: 'q.subject' },
      scope,
      2
    );
    const weeklyRes = await query(
      `SELECT DATE(q.created_at) as date, COUNT(*)::int as count
       FROM query_logs q
       WHERE q.created_at >= $1::timestamp${wsc.sql}
       GROUP BY DATE(q.created_at)
       ORDER BY DATE(q.created_at);`,
      [weekStart.toISOString(), ...wsc.params]
    );
    const countByDate = new Map<string, number>(
      weeklyRes.rows.map((r: any) => [r.date, r.count])
    );
    const weeklyData: Array<{ date: string; queries: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      weeklyData.push({ date: displayDate, queries: countByDate.get(dateStr) || 0 });
    }

    // 2. Activity feed (role-scoped) + document/chunk/student counts in parallel
    let activitySql = `SELECT id, action, target_type, user_email as actor, details as meta, created_at as timestamp
       FROM audit_logs WHERE 1=1`;
    const actParams: any[] = [];
    if (scope.mode === 'assigned') {
      const streamList = scope.hodStreams.length ? scope.hodStreams : ['__none__'];
      activitySql += ` AND (
        user_id = $1
        OR details->>'stream' = ANY($2::text[])
        OR (details->>'uploaded_by') = $1
      )`;
      actParams.push(scope.uid, streamList);
    }
    activitySql += ` ORDER BY created_at DESC LIMIT 20;`;

    // Build scoped count queries
    let docCountSql = `SELECT COUNT(*)::int as total FROM documents WHERE 1=1`;
    let chunkCountSql = `SELECT COUNT(*)::int as total FROM document_chunks WHERE 1=1`;
    let studentCountSql = `SELECT COUNT(*)::int as total FROM student_users WHERE 1=1`;
    const countParams: any[] = [];

    if (scope.mode === 'assigned') {
      const streamList = scope.hodStreams.length ? scope.hodStreams : ['__none__'];
      docCountSql += ` AND (stream = ANY($1::text[]) OR stream = 'General' OR stream IS NULL)`;
      chunkCountSql += ` AND (stream = ANY($1::text[]) OR stream = 'General' OR stream IS NULL)`;
      studentCountSql += ` AND (stream = ANY($1::text[]) OR stream = 'General')`;
      countParams.push(streamList);
    }

    const [auditRes, docRes, chunkRes, studentRes] = await Promise.all([
      query(activitySql, actParams),
      query(docCountSql, countParams).catch(() => ({ rows: [{ total: 0 }] })),
      query(chunkCountSql, countParams).catch(() => ({ rows: [{ total: 0 }] })),
      query(studentCountSql, countParams).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    const activity = auditRes.rows.map((row: any) => ({
      id: row.id,
      action: row.action,
      actor: row.actor || 'System',
      meta: {
        filename: row.meta?.title || row.meta?.file_name || row.meta?.source || '',
        ...row.meta,
      },
      timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
    }));

    const totalQueries = weeklyData.reduce((acc, d) => acc + d.queries, 0);

    return NextResponse.json({
      weekly_data: weeklyData,
      activity,
      total_queries: totalQueries,
      total_documents: docRes.rows[0]?.total || 0,
      total_chunks: chunkRes.rows[0]?.total || 0,
      total_students: studentRes.rows[0]?.total || 0,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
