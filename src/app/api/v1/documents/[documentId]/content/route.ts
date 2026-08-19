import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { documentId } = await params;

    const docRes = await query('SELECT title, file_name, stream, semester, section FROM documents WHERE id = $1;', [documentId]);
    if (docRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    // Scope check: students can only access documents in their scope
    if (user.scope === 'student') {
      const profileRes = await query('SELECT stream, sem, section FROM student_users WHERE id = $1;', [user.uid]).catch(() => ({ rows: [], rowCount: 0 }));
      if (profileRes.rowCount && profileRes.rowCount > 0) {
        const p = profileRes.rows[0] as any;
        const doc = docRes.rows[0] as any;
        const streamOk = !doc.stream || doc.stream === 'General' || doc.stream.toLowerCase() === (p.stream || '').toLowerCase();
        const semOk = !doc.semester || doc.semester === 'General' || doc.semester === p.sem;
        const secOk = !doc.section || doc.section === 'General' || doc.section.toLowerCase() === (p.section || '').toLowerCase();
        if (!streamOk || !semOk || !secOk) {
          return NextResponse.json({ detail: 'Access denied for this material.' }, { status: 403 });
        }
      }
    }

    const chunksRes = await query(
      `SELECT id, chunk_index, raw_content, page_start, page_end, paragraph_id, chunk_type, char_start, char_end, file_name
       FROM document_chunks
       WHERE document_id = $1
       ORDER BY chunk_index ASC;`,
      [documentId]
    );

    const fullContent = chunksRes.rows.map((c) => c.raw_content).join('\n\n');

    return NextResponse.json({
      document_id: documentId,
      title: docRes.rows[0].title,
      file_name: docRes.rows[0].file_name,
      total_chunks: chunksRes.rowCount,
      content: fullContent,
      chunks: chunksRes.rows,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
