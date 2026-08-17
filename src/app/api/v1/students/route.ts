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

    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream');
    const semester = searchParams.get('semester') || searchParams.get('sem');

    let sql = 'SELECT id as uid, email, display_name, name, roll, stream, sem, batch, created_at FROM student_users WHERE 1=1';
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
        batch: s.batch || '',
        created_at: s.created_at?.toISOString(),
      })),
      total: res.rowCount,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
