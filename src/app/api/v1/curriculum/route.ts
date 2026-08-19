import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream');
    const semester = searchParams.get('semester');

    let sql = 'SELECT stream, semester, subjects, sections, updated_at FROM curriculum WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (stream) {
      sql += ` AND stream = $${pIdx}`;
      params.push(stream);
      pIdx++;
    }
    if (semester) {
      sql += ` AND semester = $${pIdx}`;
      params.push(semester);
      pIdx++;
    }

    sql += ' ORDER BY stream ASC, semester ASC;';
    const res = await query(sql, params);

    return NextResponse.json({
      curriculum: res.rows,
      total: res.rowCount,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
