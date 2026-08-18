import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope } from '@/lib/server/analyticsScope';

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

    // Role privacy enforcement
    if (scope.mode === 'stream' && scope.stream) {
      if (student.stream && student.stream !== 'General' && student.stream.toLowerCase() !== scope.stream.toLowerCase()) {
        return NextResponse.json(
          { detail: 'Access denied: student is outside your stream.' },
          { status: 403 }
        );
      }
    } else if (scope.mode === 'faculty') {
      // faculty may only view students who queried their materials
      const touched = await query(
        `SELECT 1 FROM query_citations qc
         JOIN documents d ON d.id = qc.document_id
         JOIN query_logs q ON q.id = qc.query_log_id
         WHERE d.uploaded_by = $1 AND q.user_id = $2 LIMIT 1;`,
        [scope.uid, uid]
      );
      if (touched.rowCount === 0) {
        return NextResponse.json(
          { detail: 'Access denied: this student has not interacted with your materials.' },
          { status: 403 }
        );
      }
    }

    // queries_by_subject (distinct queries per subject, from query_citations)
    const qRes = await query(
      'SELECT subject, COUNT(DISTINCT query_log_id)::int as count FROM query_citations WHERE subject = ANY (SELECT subject FROM query_logs WHERE user_id = $1) GROUP BY subject;',
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
