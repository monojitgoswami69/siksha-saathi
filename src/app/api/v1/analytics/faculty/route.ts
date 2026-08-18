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

    // Visible faculty:
    //  - admin: all
    //  - hod:   faculty who teach in / are HOD of any of the user's hod_streams
    //           (or share no stream — limited to their stream's faculty)
    //  - faculty: self only
    const params: any[] = [];
    let whereClause = `WHERE u.role IN ('hod', 'faculty')`;
    if (scope.mode === 'assigned') {
      const myStreams = scope.hodStreams.length ? scope.hodStreams : ['__none__'];
      // Visible = self, OR users who have an assignment/hod_stream in one of my streams
      whereClause = `WHERE (
        u.id = $1
        OR EXISTS (SELECT 1 FROM hod_streams hs WHERE hs.user_id = u.id AND hs.stream = ANY($2::text[]))
        OR EXISTS (SELECT 1 FROM faculty_assignments fa WHERE fa.user_id = u.id AND fa.stream = ANY($2::text[]))
      )`;
      params.push(scope.uid, myStreams);
    }

    const mainRes = await query(
      `SELECT u.id, u.email, u.role, u.display_name, u.stream, u.department,
              COALESCE(
                (SELECT array_agg(s.stream ORDER BY s.stream) FROM hod_streams s WHERE s.user_id = u.id),
                '{}'::text[]
              ) as hod_streams,
              COALESCE(
                (SELECT json_agg(json_build_object('stream', fa.stream, 'semester', fa.semester, 'section', fa.section, 'subject', fa.subject))
                 FROM faculty_assignments fa WHERE fa.user_id = u.id),
                '[]'::json
              ) as faculty_assignments,
              (SELECT COUNT(DISTINCT d.id) FROM documents d WHERE d.uploaded_by = u.id)::int as doc_count,
              (SELECT COUNT(DISTINCT qc.query_log_id)
               FROM query_citations qc
               JOIN documents d ON d.id = qc.document_id
               WHERE d.uploaded_by = u.id)::int as total_queries
       FROM dashboard_users u
       ${whereClause}
       ORDER BY total_queries DESC NULLS LAST;`,
      params
    );

    // Per-faculty per-subject heatmap
    let subjWhere = `WHERE du.role IN ('hod', 'faculty')`;
    const subjParams: any[] = [];
    if (scope.mode === 'assigned') {
      const myStreams = scope.hodStreams.length ? scope.hodStreams : ['__none__'];
      subjWhere = `WHERE (du.id = $1 OR EXISTS (
        SELECT 1 FROM faculty_assignments fa2 WHERE fa2.user_id = du.id AND fa2.stream = ANY($2::text[])
      ) OR EXISTS (SELECT 1 FROM hod_streams hs2 WHERE hs2.user_id = du.id AND hs2.stream = ANY($2::text[])))`;
      subjParams.push(scope.uid, myStreams);
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

    const faculty = mainRes.rows.map((r: any) => {
      const assignments = Array.isArray(r.faculty_assignments) ? r.faculty_assignments : [];
      return {
        uid: r.id,
        email: r.email,
        name: r.display_name,
        role: r.role,
        stream: r.stream || '',
        department: r.department || '',
        doc_count: r.doc_count || 0,
        total_queries: r.total_queries || 0,
        hod_streams: r.hod_streams || [],
        subjects: Array.from(new Set(assignments.map((a: any) => a.subject).filter(Boolean))),
        semesters: Array.from(new Set(assignments.map((a: any) => a.semester).filter(Boolean))),
        sections: Array.from(new Set(assignments.map((a: any) => a.section).filter(Boolean))),
        subject_heatmap: subjectMap.get(r.id) || [],
      };
    });

    return NextResponse.json({
      faculty,
      total: faculty.length,
      scope_mode: scope.mode,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
