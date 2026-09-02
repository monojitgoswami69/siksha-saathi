import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getStoragePreviewUrl } from '@/lib/server/storage';

/**
 * Returns a single chunk (with rich metadata) for chunk-level citation
 * highlighting, plus a live preview URL of the parent document.
 *
 * Students are scope-checked: the chunk's document must be visible under
 * their stream/semester/section (General always visible).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string; chunkId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const { documentId, chunkId } = await params;

    const chunkRes = await query(
      `SELECT c.id, c.document_id, c.chunk_index, c.total_chunks, c.raw_content,
              c.page_start, c.page_end, c.paragraph_id, c.chunk_type, c.char_start, c.char_end,
              c.file_name, c.title, c.stream, c.semester, c.section, c.subject, c.module,
              d.storage_provider, d.file_key, d.preview_url
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.id = $1 AND c.document_id = $2;`,
      [chunkId, documentId]
    );

    if (chunkRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Chunk not found' }, { status: 404 });
    }

    const row = chunkRes.rows[0] as any;

    // Scope enforcement for students
    if (user.scope === 'student' || user.role === 'student') {
      const profileRes = await query(
        'SELECT stream, sem, section FROM student_users WHERE id = $1;',
        [user.uid]
      );
      if (profileRes.rowCount && profileRes.rowCount > 0) {
        const p = profileRes.rows[0] as any;
        const ok = (chunk: string, val: string) =>
          !val || chunk === 'General' || chunk === val || chunk === null;
        if (!ok(row.stream, p.stream) || !ok(row.semester, p.sem) || !ok(row.section, p.section)) {
          return NextResponse.json({ detail: 'Access denied for this material.' }, { status: 403 });
        }
      }
    }

    let previewUrl = row.preview_url;
    const fileKey = row.file_key;
    const provider = row.storage_provider || 'r2';
    if (fileKey) {
      if (provider === 'local' || !row.storage_provider) {
        previewUrl = `/api/v1/documents/${row.document_id}/file`;
      } else {
        try {
          const liveUrl = await getStoragePreviewUrl({ fileKey, provider });
          if (liveUrl) previewUrl = liveUrl;
        } catch {}
      }
    }

    if (!previewUrl && fileKey) {
      previewUrl = `/api/v1/documents/${row.document_id}/file`;
    }

    return NextResponse.json({
      chunk: {
        id: row.id,
        document_id: row.document_id,
        chunk_index: row.chunk_index,
        total_chunks: row.total_chunks,
        raw_content: row.raw_content,
        page_start: row.page_start,
        page_end: row.page_end,
        paragraph_id: row.paragraph_id,
        chunk_type: row.chunk_type,
        char_start: row.char_start,
        char_end: row.char_end,
        file_name: row.file_name,
        title: row.title,
        subject: row.subject,
        module: row.module,
      },
      document: {
        document_id: row.document_id,
        title: row.title,
        file_name: row.file_name,
        mime_type: undefined,
      },
      preview_url: previewUrl || '',
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
