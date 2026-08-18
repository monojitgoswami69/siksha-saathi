import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    // Student directory is admin + HOD only. Faculty do not get student PII.
    if (!requireRole(user, ['admin', 'hod'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    let stream = searchParams.get('stream');
    const semester = searchParams.get('semester') || searchParams.get('sem');
    const section = searchParams.get('section');

    // HOD is hard-scoped to their own stream (no cross-stream leakage).
    if (user.role !== 'admin') {
      try {
        const profileRes = await query(
          'SELECT stream FROM dashboard_users WHERE id = $1;',
          [user.uid]
        );
        const hodStream = profileRes.rows[0]?.stream;
        if (hodStream) stream = hodStream;
      } catch {}
    }

    let sql = 'SELECT id as uid, email, display_name, name, roll, stream, sem, section, created_at FROM student_users WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (stream && stream !== 'All') {
      sql += ` AND LOWER(stream) = LOWER($${pIdx})`;
      params.push(stream);
      pIdx++;
    }
    if (semester && semester !== 'All') {
      sql += ` AND sem = $${pIdx}`;
      params.push(semester);
      pIdx++;
    }
    if (section && section !== 'All') {
      sql += ` AND LOWER(section) = LOWER($${pIdx})`;
      params.push(section);
      pIdx++;
    }

    sql += ' ORDER BY created_at DESC;';
    const res = await query(sql, params);

    return NextResponse.json({
      students: res.rows.map((s) => ({
        uid: s.uid,
        email: s.email,
        name: s.name || s.display_name,
        display_name: s.display_name,
        roll: s.roll || 'N/A',
        stream: s.stream || '',
        sem: s.sem || '',
        section: s.section || '',
        created_at: s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString(),
      })),
      total: res.rowCount,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
