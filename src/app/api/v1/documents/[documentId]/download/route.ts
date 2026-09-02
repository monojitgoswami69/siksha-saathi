import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getStorageDownloadUrl } from '@/lib/server/storage';

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

    const docRes = await query(
      'SELECT id, title, file_name, storage_provider, file_key, preview_url, stream, semester, section FROM documents WHERE id = $1;',
      [documentId]
    );

    if (docRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    // Scope check: students can only download documents in their scope
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

    const doc = docRes.rows[0];
    const fileKey = doc.file_key;
    const provider = doc.storage_provider || 'r2';

    let downloadUrl = doc.preview_url;

    if (fileKey) {
      if (provider === 'local' || !doc.storage_provider) {
        downloadUrl = `/api/v1/documents/${documentId}/file?download=1`;
      } else {
        try {
          const liveUrl = await getStorageDownloadUrl({
            fileKey,
            filename: doc.file_name || doc.title,
            provider,
          });
          if (liveUrl) downloadUrl = liveUrl;
        } catch {}
      }
    }

    if (!downloadUrl && fileKey) {
      downloadUrl = `/api/v1/documents/${documentId}/file?download=1`;
    }

    return NextResponse.json({
      document_id: documentId,
      download_url: downloadUrl || '',
      title: doc.title,
      file_name: doc.file_name,
      provider,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
