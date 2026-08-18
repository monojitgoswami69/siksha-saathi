import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope, dashboardScopeClause } from '@/lib/server/analyticsScope';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const { uid } = await params;
    const scope = await resolveScope(user);

    const studentRes = await query(
      'SELECT id, email, display_name, name, roll, stream, sem, section, avatar_url FROM student_users WHERE id = $1;',
      [uid]
    );
    if (studentRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Student not found' }, { status: 404 });
    }
    const student = studentRes.rows[0] as any;

    // Privacy: a non-admin may only view a student within their scope
    // (stream/sem/section covered by their assignments or hod streams).
    if (scope.mode === 'assigned') {
      const ssc = dashboardScopeClause(
        { stream: 's.stream', semester: 's.sem', section: 's.section' },
        scope,
        1
      );
      const visible = await query(
        `SELECT 1 FROM student_users s WHERE s.id = $1${ssc.sql} LIMIT 1;`,
        [uid, ...ssc.params]
      );
      if (visible.rowCount === 0) {
        return NextResponse.json(
          { detail: 'Access denied: this student is outside your scope.' },
          { status: 403 }
        );
      }
    }

    // queries_by_subject (from query_citations for this student)
    const qRes = await query(
      'SELECT subject, COUNT(DISTINCT query_log_id)::int as count FROM query_citations WHERE query_log_id IN (SELECT id FROM query_logs WHERE user_id = $1) GROUP BY subject;',
      [uid]
    );

    const quizRes = await query(
      'SELECT score, total_questions, percentage, submitted_at FROM quiz_results WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 10;',
      [uid]
    );

    return NextResponse.json({
      student: {
        id: student.id,
        email: student.email,
        name: student.name || student.display_name,
        roll: student.roll,
        stream: student.stream,
        sem: student.sem,
        section: student.section,
      },
      queries_by_subject: qRes.rows,
      total_queries: qRes.rows.reduce((a: number, b: any) => a + b.count, 0),
      recent_quizzes: quizRes.rows,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
