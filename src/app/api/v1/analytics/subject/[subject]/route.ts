import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope } from '@/lib/server/analyticsScope';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ subject: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const { subject } = await params;
    const decodedSubj = decodeURIComponent(subject);
    const scope = await resolveScope(user);

    const scopeParams: any[] = [];
    let scopeClause = '';
    if (scope.mode === 'stream' && scope.stream) {
      scopeClause = ` AND (qc.stream = $1 OR qc.stream = 'General' OR qc.stream IS NULL)`;
      scopeParams.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      scopeClause = ` AND qc.document_id IN (SELECT id FROM documents WHERE uploaded_by = $1)`;
      scopeParams.push(scope.uid);
    }

    // distinct queries touching this subject + distinct students
    const qRes = await query(
      `SELECT COUNT(DISTINCT qc.query_log_id)::int as count,
              COUNT(DISTINCT q.user_id)::int as students
       FROM query_citations qc
       LEFT JOIN query_logs q ON q.id = qc.query_log_id
       WHERE LOWER(qc.subject) = LOWER($${scopeParams.length + 1})${scopeClause};`,
      [...scopeParams, decodedSubj]
    );

    const count = qRes.rows[0]?.count || 0;
    const students = qRes.rows[0]?.students || 0;

    // per-semester heatmap within this subject (role-scoped)
    const semRes = await query(
      `SELECT COALESCE(qc.semester, 'General') as semester,
              COUNT(DISTINCT qc.query_log_id)::int as query_count
       FROM query_citations qc
       WHERE LOWER(qc.subject) = LOWER($${scopeParams.length + 1})${scopeClause}
       GROUP BY COALESCE(qc.semester, 'General')
       ORDER BY semester;`,
      [...scopeParams, decodedSubj]
    );

    return NextResponse.json({
      subject: decodedSubj,
      total_queries: count,
      student_count: students,
      proficiency: Math.max(40, 100 - count * 2),
      semester_breakdown: semRes.rows,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
