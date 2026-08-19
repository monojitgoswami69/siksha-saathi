import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { resolveScope, dashboardScopeClause } from '@/lib/server/analyticsScope';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let stream = searchParams.get('stream');
    let semester = searchParams.get('semester') || searchParams.get('sem');
    let section = searchParams.get('section');
    const subject = searchParams.get('subject');

    // Students: auto-scope to their enrolled stream/semester/section
    if (user.scope === 'student' || user.role === 'student') {
      if (!stream || !semester || !section) {
        try {
          const profileRes = await query(
            'SELECT stream, sem, section FROM student_users WHERE id = $1;',
            [user.uid]
          );
          if (profileRes.rowCount && profileRes.rowCount > 0) {
            const profile = profileRes.rows[0] as any;
            stream = stream || profile.stream;
            semester = semester || profile.sem;
            section = section || profile.section;
          }
        } catch {}
      }
    }

    // Dashboard role scoping: admin=all; hod/faculty scoped by their
    // assignments (multi-stream + faculty assignments) via dashboardScopeClause.
    // Column refs MUST be qualified (d.) so the EXISTS subquery doesn't resolve
    // them to faculty_assignments columns.
    const dsc = (user.scope === 'dashboard' && user.role !== 'admin' && user.role !== 'student')
      ? await (async () => {
          const scope = await resolveScope(user);
          return dashboardScopeClause(
            { stream: 'd.stream', semester: 'd.semester', section: 'd.section', subject: 'd.subject' },
            scope,
            1
          );
        })()
      : { sql: '', params: [] as any[], nextIdx: 1 };

    let sql = `
      SELECT id as document_id, id, title, file_name, mime_type, file_size_bytes as file_size,
             dropbox_path, dropbox_shared_link, stream, semester, section, subject, module,
             uploaded_by, uploader_email, total_chunks, created_at
      FROM documents d
      WHERE 1=1
    `;
    const params: any[] = [...dsc.params];
    let pIdx = dsc.nextIdx;

    if (stream && stream !== 'All') {
      sql += ` AND (LOWER(d.stream) = LOWER($${pIdx}) OR d.stream = 'General' OR d.stream IS NULL)`;
      params.push(stream);
      pIdx++;
    }
    if (semester && semester !== 'All') {
      sql += ` AND (d.semester = $${pIdx} OR d.semester = 'General' OR d.semester IS NULL)`;
      params.push(semester);
      pIdx++;
    }
    if (section && section !== 'All') {
      sql += ` AND (LOWER(d.section) = LOWER($${pIdx}) OR d.section = 'General' OR d.section IS NULL)`;
      params.push(section);
      pIdx++;
    }
    if (subject && subject !== 'All Subjects') {
      sql += ` AND (LOWER(d.subject) = LOWER($${pIdx}) OR d.subject = 'General' OR d.subject IS NULL)`;
      params.push(subject);
      pIdx++;
    }

    sql += dsc.sql;
    sql += ` ORDER BY d.created_at DESC;`;

    const res = await query(sql, params);

    return NextResponse.json({
      documents: res.rows.map((d) => ({
        document_id: d.document_id,
        id: d.id,
        title: d.title,
        file_name: d.file_name,
        mime_type: d.mime_type,
        file_size: parseInt(d.file_size || '0', 10),
        file_size_bytes: parseInt(d.file_size || '0', 10),
        stream: d.stream,
        semester: d.semester,
        section: d.section,
        subject: d.subject,
        module: d.module,
        total_chunks: d.total_chunks,
        chunks_count: d.total_chunks,
        created_at: d.created_at ? new Date(d.created_at).toISOString() : new Date().toISOString(),
        uploaded_by: d.uploader_email || d.uploaded_by,
        dropbox_shared_link: d.dropbox_shared_link,
      })),
      total: res.rowCount,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
