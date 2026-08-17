import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'superuser', 'hod', 'faculty', 'assistant']) && user.uid !== (await params).uid) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const { uid } = await params;

    const studentRes = await query(
      'SELECT id, email, display_name, name, roll, stream, sem, batch, avatar_url FROM student_users WHERE id = $1;',
      [uid]
    );

    if (studentRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Student not found' }, { status: 404 });
    }

    const student = studentRes.rows[0];

    const qRes = await query(
      'SELECT subject, COUNT(*)::int as count FROM query_logs WHERE user_id = $1 GROUP BY subject;',
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
        batch: student.batch,
      },
      queries_by_subject: qRes.rows,
      total_queries: qRes.rows.reduce((a, b) => a + b.count, 0),
      recent_quizzes: quizRes.rows,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
