import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'superuser', 'hod', 'faculty', 'assistant'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    // 1. Weekly data: count queries for each of the last 7 days
    const weeklyData: Array<{ date: string; queries: number }> = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayDate = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

      const res = await query(
        "SELECT COUNT(*)::int as count FROM query_logs WHERE created_at >= $1::timestamp AND created_at < ($1::timestamp + INTERVAL '1 day');",
        [dateStr]
      );
      const count = res.rows[0]?.count || 0;
      weeklyData.push({
        date: displayDate,
        queries: count,
      });
    }

    // 2. Recent activity from audit_logs
    const auditRes = await query(
      `SELECT id, action, target_type, user_email as actor, details as meta, created_at as timestamp
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 20;`
    );

    const activity = auditRes.rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor || 'System',
      meta: {
        filename: row.meta?.title || row.meta?.source || '',
        ...row.meta,
      },
      timestamp: row.timestamp.toISOString(),
    }));

    const totalQueries = weeklyData.reduce((acc, d) => acc + d.queries, 0);

    return NextResponse.json({
      weekly_data: weeklyData,
      activity,
      total_queries: totalQueries,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
