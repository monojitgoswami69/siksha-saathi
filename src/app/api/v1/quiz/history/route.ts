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
      submitted_at: r.submitted_at.toISOString(),
    }));

    const totalQuizzes = history.length;
    const avgScore = totalQuizzes > 0
      ? Math.round(history.reduce((acc, h) => acc + h.percentage, 0) / totalQuizzes)
      : 0;

    return NextResponse.json({
      quiz_history: history,
      total_quizzes: totalQuizzes,
      average_percentage: avgScore,
      recent_subject: history[0]?.subject || 'None',
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
