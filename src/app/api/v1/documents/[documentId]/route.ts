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

    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Permission denied' }, { status: 403 });
    }

    const { documentId } = await params;

    const docRes = await query(
      'SELECT id, title, file_name, storage_provider, file_key, dropbox_path FROM documents WHERE id = $1;',
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
        file_name: doc.file_name,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Permission denied' }, { status: 403 });
    }

    const { documentId } = await params;
    const body = await req.json();

    const { title, subject, module, stream, semester, section } = body;

    const existingRes = await query(
      'SELECT id, title FROM documents WHERE id = $1;',
      [documentId]
    );

    if (existingRes.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const chunkUpdates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (title !== undefined) {
      updates.push(`title = $${p}`);
      chunkUpdates.push(`title = $${p}`);
      values.push(title);
      p++;
    }
    if (subject !== undefined) {
      updates.push(`subject = $${p}`);
      chunkUpdates.push(`subject = $${p}`);
      values.push(subject);
      p++;
    }
    if (module !== undefined) {
      updates.push(`module = $${p}`);
      chunkUpdates.push(`module = $${p}`);
      values.push(module);
      p++;
    }
    if (stream !== undefined) {
      updates.push(`stream = $${p}`);
      chunkUpdates.push(`stream = $${p}`);
      values.push(stream);
      p++;
    }
    if (semester !== undefined) {
      updates.push(`semester = $${p}`);
      chunkUpdates.push(`semester = $${p}`);
      values.push(semester);
      p++;
    }
    if (section !== undefined) {
      updates.push(`section = $${p}`);
      chunkUpdates.push(`section = $${p}`);
      values.push(section);
      p++;
    }

    if (updates.length === 0) {
      return NextResponse.json({ detail: 'No update fields provided' }, { status: 400 });
    }

    values.push(documentId);
    const docIdParam = `$${p}`;

    // Update documents table
    const updateDocSql = `UPDATE documents SET ${updates.join(', ')} WHERE id = ${docIdParam} RETURNING *;`;
    const docResult = await query(updateDocSql, values);

    // Update document_chunks table to keep retrieval metadata strictly in sync
    const updateChunksSql = `UPDATE document_chunks SET ${chunkUpdates.join(', ')} WHERE document_id = ${docIdParam};`;
    await query(updateChunksSql, values);

    // Log audit
    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'document.update',
      targetType: 'document',
      details: {
        document_id: documentId,
        updated_fields: Object.keys(body),
      },
    });

    return NextResponse.json({
      message: 'Document metadata updated successfully',
      document: docResult.rows[0],
    });
  } catch (err: any) {
    console.error('Failed to update document metadata:', err);
    return NextResponse.json({ detail: err.message }, { status: 500 });
  }
}

