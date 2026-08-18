import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { uploadStorageFile } from '@/lib/server/storage';
import { logAudit } from '@/lib/server/audit';
import { invalidateFilterCache } from '@/app/api/v1/filters/route';

/**
 * Enqueue an ingestion job. The heavy pipeline (extraction / OCR / embeddings)
 * runs in a separate long-running worker (see /ingestion-worker) which polls
 * the ingestion_jobs table. This route only authenticates, scopes, uploads the
 * original asset to storage, creates the document row (status=processing), and
 * enqueues a job — then returns 202 immediately (fast, serverless-safe).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'hod', 'faculty'])) {
      return NextResponse.json(
        { detail: 'Permission denied. Faculty/Admin role required.' },
        { status: 403 }
      );
    }

    let fileName = '';
    let title = '';
    let stream = 'General';
    let semester = 'General';
    let section = 'General';
    let subject = 'General';
    let module = 'General';
    let mimeType = 'text/plain';
    let fileBuffer: Buffer | null = null;
    let rawContent = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      fileName = (formData.get('source') as string) || (formData.get('file_name') as string) || file?.name || 'document.txt';
      title = (formData.get('title') as string) || fileName;
      stream = (formData.get('stream') as string) || 'General';
      semester = (formData.get('semester') as string) || (formData.get('sem') as string) || 'General';
      section = (formData.get('section') as string) || 'General';
      subject = (formData.get('subject') as string) || 'General';
      module = (formData.get('module') as string) || 'General';

      if (file) {
        mimeType = file.type || 'application/octet-stream';
        const bytes = await file.arrayBuffer();
        fileBuffer = Buffer.from(bytes);
      } else {
        rawContent = (formData.get('content') as string) || '';
      }
    } else {
      const body = await req.json();
      fileName = body.source || body.file_name || 'text_input.txt';
      title = body.title || fileName;
      stream = body.stream || 'General';
      semester = body.semester || body.sem || 'General';
      section = body.section || 'General';
      subject = body.subject || 'General';
      module = body.module || 'General';
      mimeType = body.mime_type || 'text/plain';
      if (body.file_data_base64) {
        fileBuffer = Buffer.from(body.file_data_base64, 'base64');
      } else if (body.content) {
        rawContent = body.content;
      }
    }

    if (!fileBuffer && !rawContent.trim()) {
      return NextResponse.json({ detail: 'File or content text is required' }, { status: 400 });
    }

    // Non-admin (hod/faculty) uploads are hard-scoped to their own stream.
    if (user.scope === 'dashboard' && user.role !== 'admin') {
      try {
        const profileRes = await query(
          'SELECT stream FROM dashboard_users WHERE id = $1;',
          [user.uid]
        );
        const ownStream = profileRes.rows[0]?.stream;
        if (ownStream) {
          stream = ownStream;
        } else {
          return NextResponse.json(
            { detail: 'Your account is not associated with a stream. Contact the administrator.' },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json({ detail: 'Could not verify your stream scope.' }, { status: 500 });
      }
    }

    // Normalize: text-only ingest becomes a .txt buffer so the worker always
    // has a stored file to download.
    if (!fileBuffer && rawContent) {
      fileBuffer = Buffer.from(rawContent);
      if (!fileName.toLowerCase().endsWith('.txt')) {
        fileName = `${(title || 'notes').toLowerCase().replace(/\s+/g, '_')}.txt`;
      }
      mimeType = 'text/plain';
    }
    // By now fileBuffer is guaranteed (we returned 400 above if both were empty).
    const finalBuffer: Buffer = fileBuffer as Buffer;

    // 1. Upload original asset to storage (R2 / Dropbox)
    let storageProvider = 'local';
    let fileKey: string | null = null;
    let previewUrl: string | null = null;
    const fileSize = finalBuffer.length;

    try {
      const stored = await uploadStorageFile({
        filename: fileName,
        buffer: finalBuffer,
        mimeType,
        folder: 'course_materials',
      });
      storageProvider = stored.provider;
      fileKey = stored.fileKey || null;
      previewUrl = stored.publicUrl || null;
    } catch (storageErr: any) {
      console.warn('Storage upload note (proceeding with indexing):', storageErr.message);
    }

    // 2. Insert document row (status = processing)
    const docRes = await query(
      `INSERT INTO documents (
        title, file_name, mime_type, file_size_bytes, storage_provider, file_key,
        preview_url, stream, semester, section, subject,
        module, uploaded_by, uploader_email, status, processing_progress, total_chunks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'processing', 10, 0)
      RETURNING id, title, file_name, status, processing_progress, preview_url;`,
      [
        title,
        fileName,
        mimeType,
        fileSize,
        storageProvider,
        fileKey,
        previewUrl,
        stream,
        semester,
        section,
        subject,
        module,
        user.uid,
        user.email,
      ]
    );

    const newDoc = docRes.rows[0];

    // 3. Enqueue an ingestion job for the worker
    await query(
      `INSERT INTO ingestion_jobs (document_id, status) VALUES ($1, 'pending');`,
      [newDoc.id]
    );

    invalidateFilterCache();

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'document.ingest.enqueued',
      targetType: 'document',
      details: { docId: newDoc.id, title, stream, semester, section, subject },
    });

    // 4. Immediate 202 Accepted
    return NextResponse.json(
      {
        document_id: newDoc.id,
        title: newDoc.title,
        status: 'processing',
        processing_progress: 10,
        message:
          'Document uploaded. Extraction, OCR & indexing will be processed by the ingestion worker shortly.',
        preview_url: newDoc.preview_url,
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error('Ingest Endpoint Error:', err);
    return NextResponse.json({ detail: err.message || 'Ingestion failed' }, { status: 500 });
  }
}
