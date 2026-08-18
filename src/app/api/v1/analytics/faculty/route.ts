import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope } from '@/lib/server/analyticsScope';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Access denied' }, { status: 403 });
    }

    const scope = await resolveScope(user);

    // Per-faculty totals: docs owned, distinct queries touching their materials
    const params: any[] = [];
    let whereClause = `WHERE u.role IN ('hod', 'faculty', 'admin')`;
    if (scope.mode === 'stream' && scope.stream) {
      whereClause += ` AND (u.stream = $1 OR u.stream IS NULL)`;
      params.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      whereClause = `WHERE u.id = $1`;
      params.push(scope.uid);
    }

    const mainRes = await query(
      `SELECT u.id, u.email, u.display_name, u.stream, u.department,
              COUNT(DISTINCT d.id)::int as doc_count,
              COUNT(DISTINCT qc.query_log_id)::int as total_queries,
              ARRAY_AGG(DISTINCT d.subject) FILTER (WHERE d.subject IS NOT NULL) as subjects,
              ARRAY_AGG(DISTINCT d.semester) FILTER (WHERE d.semester IS NOT NULL) as semesters,
              ARRAY_AGG(DISTINCT d.section) FILTER (WHERE d.section IS NOT NULL) as sections
       FROM dashboard_users u
       LEFT JOIN documents d ON d.uploaded_by = u.id
       LEFT JOIN query_citations qc ON qc.document_id = d.id
       ${whereClause}
       GROUP BY u.id, u.email, u.display_name, u.stream, u.department
       ORDER BY total_queries DESC NULLS LAST;`,
      params
    );

    // Per-faculty per-subject heatmap (distinct queries)
    const subjParams: any[] = [];
    let subjWhere = `WHERE du.role IN ('hod', 'faculty', 'admin')`;
    if (scope.mode === 'stream' && scope.stream) {
      subjWhere += ` AND (du.stream = $1 OR du.stream IS NULL)`;
      subjParams.push(scope.stream);
    } else if (scope.mode === 'faculty') {
      subjWhere = `WHERE du.id = $1`;
      subjParams.push(scope.uid);
    }
    const subjRes = await query(
      `SELECT du.id as faculty_id, COALESCE(d.subject, 'General') as subject,
              COUNT(DISTINCT qc.query_log_id)::int as query_count
       FROM dashboard_users du
       LEFT JOIN documents d ON d.uploaded_by = du.id
       LEFT JOIN query_citations qc ON qc.document_id = d.id
       ${subjWhere} AND d.id IS NOT NULL
       GROUP BY du.id, d.subject;`,
      subjParams
    );

    const subjectMap = new Map<string, Array<{ subject: string; query_count: number }>>();
    subjRes.rows.forEach((r: any) => {
      const arr = subjectMap.get(r.faculty_id) || [];
      if (r.subject) arr.push({ subject: r.subject, query_count: r.query_count });
      subjectMap.set(r.faculty_id, arr);
    });

    const faculty = mainRes.rows.map((r: any) => ({
      uid: r.id,
      email: r.email,
      name: r.display_name,
      stream: r.stream || '',
      department: r.department || '',
      doc_count: r.doc_count || 0,
      total_queries: r.total_queries || 0,
      subjects: (r.subjects || []).filter(Boolean),
      semesters: (r.semesters || []).filter(Boolean),
      sections: (r.sections || []).filter(Boolean),
      subject_heatmap: subjectMap.get(r.id) || [],
    }));

    return NextResponse.json({
      faculty,
      total: faculty.length,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
