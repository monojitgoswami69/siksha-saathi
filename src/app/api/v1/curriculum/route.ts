import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    // Security & Scope: If student, strictly lock down to their own enrolled stream & semester
    if (user.scope === 'student' || user.role === 'student') {
      const profileRes = await query(
        'SELECT stream, sem FROM student_users WHERE id = $1;',
        [user.uid]
      ).catch(() => ({ rows: [], rowCount: 0 }));

      if (profileRes.rowCount && profileRes.rowCount > 0) {
        const p = profileRes.rows[0] as any;
        const studentStream = p.stream || 'cse';
        const studentSem = String(p.sem || '1');
        const cleanSem = studentSem.replace(/^(?:sem|semester)\s*/i, '');

        const res = await query(
          'SELECT stream, semester, subjects, sections, updated_at FROM curriculum WHERE LOWER(stream) = LOWER($1) AND (semester = $2 OR semester = $3);',
          [studentStream, studentSem, cleanSem]
        );

        return NextResponse.json({
          curriculum: res.rows,
          total: res.rowCount,
        });
      }
    }

    // Admin / Faculty / Dashboard users
    const { searchParams } = new URL(req.url);
    const stream = searchParams.get('stream');
    const semester = searchParams.get('semester');

    let sql = 'SELECT stream, semester, subjects, sections, updated_at FROM curriculum WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (stream) {
      sql += ` AND LOWER(stream) = LOWER($${pIdx})`;
      params.push(stream);
      pIdx++;
    }
    if (semester) {
      const cleanSem = semester.replace(/^(?:sem|semester)\s*/i, '');
      sql += ` AND (semester = $${pIdx} OR semester = $${pIdx + 1})`;
      params.push(semester, cleanSem);
      pIdx += 2;
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
