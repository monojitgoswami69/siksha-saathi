import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { extractDocumentContent, chunkExtractedDocument, ExtractionResult } from '@/lib/server/documentProcessor';
import { getBatchEmbeddings, formatVector } from '@/lib/server/embeddings';
import { uploadStorageFile } from '@/lib/server/storage';
import { logAudit } from '@/lib/server/audit';
import { invalidateFilterCache } from '@/app/api/v1/filters/route';

/**
 * Background async worker to process document extraction, chunking, and embedding
 */
async function processDocumentInBackground({
  docId,
  fileBuffer,
  rawContent,
  mimeType,
  source,
  title,
  stream,
  semester,
  subject,
  module,
  user,
}: {
  docId: string;
  fileBuffer: Buffer | null;
  rawContent: string;
  mimeType: string;
  source: string;
  title: string;
  stream: string;
  semester: string;
  subject: string;
  module: string;
  user: { uid: string; email: string; role: string };
}) {
  try {
    // 1. Text extraction (30% progress)
    await query('UPDATE documents SET processing_progress = 30 WHERE id = $1;', [docId]);

    let extraction: ExtractionResult;

    if (fileBuffer && fileBuffer.length > 0) {
      extraction = await extractDocumentContent(source, fileBuffer, mimeType);
    } else {
      extraction = {
        fullText: rawContent,
        pages: [{ pageNumber: 1, text: rawContent }],
      };
    }

    if (!extraction.fullText.trim()) {
      throw new Error('No readable text content extracted from document.');
    }

    // 2. Semantic Chunking (60% progress)
    await query('UPDATE documents SET processing_progress = 60 WHERE id = $1;', [docId]);

    const chunks = chunkExtractedDocument({
      extraction,
      source,
      title,
      stream,
      semester,
      subject,
      module,
    });

    if (chunks.length === 0) {
      throw new Error('Failed to generate semantic text chunks.');
    }

    // 3. Batch Vector Embeddings (80% progress)
    await query('UPDATE documents SET processing_progress = 80 WHERE id = $1;', [docId]);

    const chunkTexts = chunks.map((c) => c.rawContent);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // 4. Batch insert into document_chunks
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const vectorStr = embedding && embedding.length > 0 ? formatVector(embedding) : null;

      await query(
        `INSERT INTO document_chunks (
          document_id, chunk_index, total_chunks, raw_content,
          page_start, page_end, source, title, stream, semester, subject, module, embedding
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::vector);`,
        [
          docId,
          chunk.chunkIndex,
          chunks.length,
          chunk.rawContent,
          chunk.pageStart || null,
          chunk.pageEnd || null,
          chunk.source,
          chunk.title,
          chunk.stream,
          chunk.semester,
          chunk.subject,
          chunk.module,
          vectorStr,
        ]
      );
    }

    // 5. Complete Indexing (100% progress)
    await query(
      `UPDATE documents 
       SET status = 'ready', processing_progress = 100, total_chunks = $1, error_message = NULL 
       WHERE id = $2;`,
      [chunks.length, docId]
    );

    invalidateFilterCache();

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'document.ingest.completed',
      targetType: 'document',
      details: { docId, title, chunks: chunks.length, stream, semester, subject },
    });

    console.log(`✅ [Async Ingest] Document "${title}" (${docId}) indexed successfully with ${chunks.length} chunks.`);
  } catch (err: any) {
    console.error(`❌ [Async Ingest] Failed for docId ${docId}:`, err);
    await query(
      `UPDATE documents 
       SET status = 'failed', error_message = $1, processing_progress = 0 
       WHERE id = $2;`,
      [err.message || 'Background indexing failed', docId]
    ).catch(() => {});

    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'document.ingest.failed',
      targetType: 'document',
      details: { docId, title, error: err.message },
    }).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    if (!requireRole(user, ['admin', 'superuser', 'hod', 'faculty'])) {
      return NextResponse.json({ detail: 'Permission denied. Faculty/Admin role required.' }, { status: 403 });
    }

    let source = '';
    let title = '';
    let stream = 'General';
    let semester = 'General';
    let subject = 'General';
    let module = 'General';
    let mimeType = 'text/plain';
    let fileBuffer: Buffer | null = null;
    let rawContent = '';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      source = (formData.get('source') as string) || file?.name || 'document.txt';
      title = (formData.get('title') as string) || source;
      stream = (formData.get('stream') as string) || 'General';
      semester = (formData.get('semester') as string) || (formData.get('sem') as string) || 'General';
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
      source = body.source || 'text_input.txt';
      title = body.title || source;
      stream = body.stream || 'General';
      semester = body.semester || body.sem || 'General';
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

    // 1. Upload original asset to Cloudflare R2 / Dropbox storage
    let storageProvider = 'local';
    let fileKey = null;
    let previewUrl = null;
    let fileSize = fileBuffer ? fileBuffer.length : Buffer.byteLength(rawContent);

    if (fileBuffer) {
      try {
        const stored = await uploadStorageFile({
          filename: source,
          buffer: fileBuffer,
          mimeType,
          folder: 'course_materials',
        });
        storageProvider = stored.provider;
        fileKey = stored.fileKey || null;
        previewUrl = stored.publicUrl || null;
      } catch (storageErr: any) {
        console.warn('Storage upload note (proceeding with indexing):', storageErr.message);
      }
    }

    // 2. Insert initial document record with status = 'processing'
    const docRes = await query(
      `INSERT INTO documents (
        title, source, mime_type, file_size_bytes, storage_provider, file_key,
        preview_url, stream, semester, subject,
        module, uploaded_by, uploader_email, status, processing_progress, total_chunks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'processing', 10, 0)
      RETURNING id, title, source, status, processing_progress, preview_url;`,
      [
        title,
        source,
        mimeType,
        fileSize,
        storageProvider,
        fileKey,
        previewUrl,
        stream,
        semester,
        subject,
        module,
        user.uid,
        user.email,
      ]
    );

    const newDoc = docRes.rows[0];

    // 3. Trigger asynchronous background processing worker
    processDocumentInBackground({
      docId: newDoc.id,
      fileBuffer,
      rawContent,
      mimeType,
      source,
      title,
      stream,
      semester,
      subject,
      module,
      user: { uid: user.uid, email: user.email, role: user.role },
    }).catch((e) => console.error('Background ingestion launch error:', e));

    // 4. Return immediate 202 Accepted response in <500ms
    return NextResponse.json(
      {
        document_id: newDoc.id,
        title: newDoc.title,
        status: 'processing',
        processing_progress: 10,
        message: 'Document uploaded. Text extraction and vector indexing are running in background.',
        preview_url: newDoc.preview_url,
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error('Ingest Endpoint Error:', err);
    return NextResponse.json({ detail: err.message || 'Ingestion failed' }, { status: 500 });
  }
}
