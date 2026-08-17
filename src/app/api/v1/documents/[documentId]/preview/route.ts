import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { getStoragePreviewUrl } from '@/lib/server/storage';

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
      'SELECT id, title, source, storage_provider, file_key, preview_url, dropbox_path, dropbox_shared_link FROM documents WHERE id = $1;',
      [documentId]
    );

    if (docRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    const doc = docRes.rows[0];
    const fileKey = doc.file_key || doc.dropbox_path;
    const provider = doc.storage_provider || (doc.dropbox_path ? 'dropbox' : 'r2');

    let previewUrl = doc.preview_url || doc.dropbox_shared_link;

    if (fileKey) {
      try {
        const liveUrl = await getStoragePreviewUrl({
          fileKey,
          provider,
        });
        if (liveUrl) previewUrl = liveUrl;
      } catch {}
    }

    return NextResponse.json({
      document_id: documentId,
      preview_url: previewUrl || '',
      title: doc.title,
      source: doc.source,
      provider,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
