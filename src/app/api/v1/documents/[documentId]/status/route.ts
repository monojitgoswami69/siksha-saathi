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

    const res = await query(
      `SELECT id, title, file_name, mime_type, status, processing_progress, total_chunks, error_message, created_at
       FROM documents
       WHERE id = $1;`,
      [documentId]
    );

    if (res.rowCount === 0) {
      return NextResponse.json({ detail: 'Document not found' }, { status: 404 });
    }

    const doc = res.rows[0];
    return NextResponse.json({
      document_id: doc.id,
      title: doc.title,
      file_name: doc.file_name,
      mime_type: doc.mime_type,
      status: doc.status || 'ready',
      processing_progress: doc.processing_progress || 0,
      total_chunks: doc.total_chunks || 0,
      error_message: doc.error_message || null,
      created_at: doc.created_at,
    });
  } catch (err: any) {
    return NextResponse.json({ detail: err.message || 'Status check failed' }, { status: 500 });
  }
}
