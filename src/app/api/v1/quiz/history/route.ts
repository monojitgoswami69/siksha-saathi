import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const res = await query(
      `SELECT id as quiz_id, subject, module, score, total_questions, percentage,
              time_taken_seconds, submitted_at
       FROM quiz_results
       WHERE user_id = $1
       ORDER BY submitted_at DESC
       LIMIT 30;`,
      [user.uid]
    );

    const history = res.rows.map((r) => ({
      quiz_id: r.quiz_id,
      subject: r.subject,
      module: r.module,
      score: r.score,
      total_questions: r.total_questions,
      percentage: r.percentage,
      time_taken_seconds: r.time_taken_seconds,
      submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString() : new Date().toISOString(),
    }));

    const totalQuizzes = history.length;
    const avgScore = totalQuizzes > 0
      ? Math.round(history.reduce((acc, h) => acc + h.percentage, 0) / totalQuizzes)
      : 0;

    // Calculate real curriculum completion
    let totalEnrolledSubjects = 1;
    try {
      const studentProfile = await query(
        'SELECT stream, sem FROM student_users WHERE id = $1;',
        [user.uid]
      );
      if (studentProfile.rowCount && studentProfile.rowCount > 0) {
        const p = studentProfile.rows[0] as any;
        const curricRes = await query(
          'SELECT subjects FROM curriculum WHERE LOWER(stream) = LOWER($1) AND (semester = $2 OR semester = $3);',
          [p.stream, String(p.sem), String(p.sem).replace(/^(?:sem|semester)\s*/i, '')]
        );
        if (curricRes.rowCount && curricRes.rowCount > 0 && Array.isArray(curricRes.rows[0].subjects)) {
          totalEnrolledSubjects = Math.max(1, curricRes.rows[0].subjects.length);
        }
      }
    } catch {}

    const distinctSubjectsTested = new Set(
      history.map((h) => (h.subject || '').toLowerCase()).filter((s) => s && s !== 'none')
    ).size;
    const studyCompletion = totalQuizzes > 0
      ? Math.min(100, Math.round((distinctSubjectsTested / totalEnrolledSubjects) * 100))
      : 0;

    // Fetch ongoing / incomplete quizzes
    const activeRes = await query(
      `SELECT id as quiz_id, subject, num_questions, document_id, file_name,
              selected_answers, review_answers, status, created_at, updated_at
       FROM quizzes
       WHERE user_id = $1 AND status IN ('available', 'in_progress')
       ORDER BY updated_at DESC
       LIMIT 10;`,
      [user.uid]
    );

    const activeQuizzes = activeRes.rows.map((r) => {
      const answersMap = typeof r.selected_answers === 'string' ? JSON.parse(r.selected_answers) : (r.selected_answers || {});
      const answeredCount = Object.keys(answersMap).length;
      return {
        quiz_id: r.quiz_id,
        subject: r.subject,
        num_questions: r.num_questions,
        answered_count: answeredCount,
        status: answeredCount > 0 ? 'in_progress' : r.status,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      };
    });

    return NextResponse.json({
      quiz_history: history,
      active_quizzes: activeQuizzes,
      total_quizzes: totalQuizzes,
      average_percentage: avgScore,
      study_completion: studyCompletion,
      recent_subject: history[0]?.subject || 'None',
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
