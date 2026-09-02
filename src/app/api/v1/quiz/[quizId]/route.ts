import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    if (!quizId) {
      return NextResponse.json({ detail: 'Quiz ID is required' }, { status: 400 });
    }

    // 1. Check persistent quizzes table first
    const quizRes = await query(
      `SELECT id as quiz_id, subject, num_questions, questions, selected_answers, review_answers,
              status, score, percentage, created_at, completed_at
       FROM quizzes
       WHERE id = $1 AND user_id = $2
       LIMIT 1;`,
      [quizId, user.uid]
    );

    if (quizRes.rowCount && quizRes.rowCount > 0) {
      const q = quizRes.rows[0];
      const questionsList = typeof q.questions === 'string' ? JSON.parse(q.questions) : q.questions;
      const selectedAnswers = typeof q.selected_answers === 'string' ? JSON.parse(q.selected_answers) : (q.selected_answers || {});
      const reviewAnswers = typeof q.review_answers === 'string' ? JSON.parse(q.review_answers) : (q.review_answers || {});

      return NextResponse.json({
        quiz_id: q.quiz_id,
        subject: q.subject,
        num_questions: q.num_questions,
        questions: questionsList || [],
        answers: selectedAnswers || {},
        review_answers: reviewAnswers || {},
        status: q.status,
        score: q.score,
        percentage: q.percentage,
        is_review: q.status === 'completed',
        created_at: q.created_at,
        completed_at: q.completed_at,
      });
    }

    // 2. Fallback to quiz_results for legacy submissions
    const res = await query(
      `SELECT id as quiz_id, subject, module, score, total_questions, percentage,
              time_taken_seconds, questions, answers, submitted_at
       FROM quiz_results
       WHERE id = $1 AND user_id = $2
       LIMIT 1;`,
      [quizId, user.uid]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'Assessment not found' }, { status: 404 });
    }

    const r = res.rows[0];
    const questionsList = typeof r.questions === 'string' ? JSON.parse(r.questions) : r.questions;
    const answersMap = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;

    return NextResponse.json({
      quiz_id: r.quiz_id,
      subject: r.subject,
      module: r.module,
      score: r.score,
      total_questions: r.total_questions,
      percentage: r.percentage,
      time_taken_seconds: r.time_taken_seconds,
      questions: questionsList || [],
      answers: answersMap || {},
      submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString() : new Date().toISOString(),
      is_review: true,
      status: 'completed',
    });
  } catch (err: any) {
    console.error('Fetch quiz detail error:', err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    const body = await req.json();
    const { selected_answers = {}, review_answers = {}, status = 'in_progress' } = body;

    await query(
      `UPDATE quizzes
       SET selected_answers = $1,
           review_answers = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5;`,
      [
        JSON.stringify(selected_answers),
        JSON.stringify(review_answers),
        status,
        quizId,
        user.uid,
      ]
    );

    return NextResponse.json({ success: true, quiz_id: quizId, status });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { quizId } = await context.params;
    await query(`DELETE FROM quizzes WHERE id = $1 AND user_id = $2;`, [quizId, user.uid]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
