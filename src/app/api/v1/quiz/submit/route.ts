import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query, initDbSchema } from '@/lib/server/db';

export async function POST(req: NextRequest) {
  try {
    await initDbSchema();
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      quiz_id,
      subject = 'General',
      module,
      answers = {},
      questions = [],
      time_taken = 0,
    } = body;

    let score = 0;
    const totalQuestions = questions.length || Object.keys(answers).length;

    questions.forEach((q: any) => {
      const selected = answers[q.id];
      if (selected && selected === q.correct_option) {
        score += 1;
      }
    });

    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    const res = await query(
      `INSERT INTO quiz_results (user_id, subject, module, score, total_questions, percentage, time_taken_seconds, questions, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, submitted_at;`,
      [
        user.uid,
        subject,
        module || null,
        score,
        totalQuestions,
        percentage,
        time_taken,
        JSON.stringify(questions),
        JSON.stringify(answers),
      ]
    );

    const row = res.rows[0];

    return NextResponse.json({
      result_id: row.id,
      quiz_id: quiz_id || row.id,
      subject,
      score,
      total_questions: totalQuestions,
      percentage,
      time_taken_seconds: time_taken,
      submitted_at: row.submitted_at.toISOString(),
      message: `Scored ${score}/${totalQuestions} (${percentage}%)`,
    });
  } catch (err: any) {
    console.error('Quiz submit error:', err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
