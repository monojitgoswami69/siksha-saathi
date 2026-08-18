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

    // 1. Weekly data (query_logs scoped)
    const weeklyData: Array<{ date: string; queries: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const wsc = dashboardScopeClause(
        { stream: 'q.stream', semester: 'q.semester', section: 'q.section', subject: 'q.subject' },
        scope,
        2
      );
      const res = await query(
        `SELECT COUNT(*)::int as count FROM query_logs q
         WHERE q.created_at >= $1::timestamp AND q.created_at < ($1::timestamp + INTERVAL '1 day')${wsc.sql};`,
        [dateStr, ...wsc.params]
      );
      weeklyData.push({ date: displayDate, queries: res.rows[0]?.count || 0 });
    }

    // 2. Activity feed (role-scoped)
    let activitySql = `SELECT id, action, target_type, user_email as actor, details as meta, created_at as timestamp
       FROM audit_logs WHERE 1=1`;
    const actParams: any[] = [];
    if (scope.mode === 'assigned') {
      // HOD/faculty see their own actions + actions on materials in their scope
      // (details->>'stream' in their hod streams, or uploaded by them).
      const streamList = scope.hodStreams.length ? scope.hodStreams : ['__none__'];
      activitySql += ` AND (
        user_id = $1
        OR details->>'stream' = ANY($2::text[])
        OR (details->>'uploaded_by') = $1
      )`;
      actParams.push(scope.uid, streamList);
    }
    activitySql += ` ORDER BY created_at DESC LIMIT 20;`;
    const auditRes = await query(activitySql, actParams);

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
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
