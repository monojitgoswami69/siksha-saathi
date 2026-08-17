import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { deleteStorageFile } from '@/lib/server/storage';
import { logAudit } from '@/lib/server/audit';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'superuser', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Permission denied' }, { status: 403 });
    }

    const { documentId } = await params;

    const docRes = await query(
      'SELECT id, title, source, storage_provider, file_key, dropbox_path FROM documents WHERE id = $1;',
      [documentId]
    );

    if (docRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    const doc = docRes.rows[0];
    const fileKey = doc.file_key || doc.dropbox_path;
    const provider = doc.storage_provider || (doc.dropbox_path ? 'dropbox' : 'r2');

    // 1. Delete from Cloud Storage (R2 or Dropbox)
    if (fileKey) {
      await deleteStorageFile({ fileKey, provider });
    }

    // 2. Delete from NeonDB (cascade deletes document_chunks automatically)
    await query('DELETE FROM documents WHERE id = $1;', [documentId]);

    // 3. Log audit
    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'document.delete',
      targetType: 'document',
      details: {
        document_id: documentId,
        title: doc.title,
        source: doc.source,
        provider,
      },
    });

    return NextResponse.json({
      message: `Document "${doc.title}" deleted successfully`,
      document_id: documentId,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}
