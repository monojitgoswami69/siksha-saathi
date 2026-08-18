import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

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

    let sql = `
      SELECT id as document_id, id, title, file_name, mime_type, file_size_bytes as file_size,
             dropbox_path, dropbox_shared_link, stream, semester, section, subject, module,
             uploaded_by, uploader_email, total_chunks, created_at
      FROM documents
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (stream && stream !== 'All') {
      sql += ` AND (stream = $${pIdx} OR stream = 'General' OR stream IS NULL)`;
      params.push(stream);
      pIdx++;
    }
    if (semester && semester !== 'All') {
      sql += ` AND (semester = $${pIdx} OR semester = 'General' OR semester IS NULL)`;
      params.push(semester);
      pIdx++;
    }
    if (section && section !== 'All') {
      sql += ` AND (section = $${pIdx} OR section = 'General' OR section IS NULL)`;
      params.push(section);
      pIdx++;
    }
    if (subject && subject !== 'All Subjects') {
      sql += ` AND (LOWER(subject) = LOWER($${pIdx}) OR subject = 'General' OR subject IS NULL)`;
      params.push(subject);
      pIdx++;
    }

    sql += ` ORDER BY created_at DESC;`;

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
