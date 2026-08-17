import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { extractDocumentContent, chunkExtractedDocument } from '@/lib/server/documentProcessor';
import { getBatchEmbeddings, formatVector } from '@/lib/server/embeddings';
import { uploadStorageFile } from '@/lib/server/storage';
import { logAudit } from '@/lib/server/audit';

export async function POST(req: NextRequest) {
  const t0 = Date.now();
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
      return NextResponse.json({ detail: 'Provide either a file or text content' }, { status: 400 });
    }

    // 1. Text Extraction
    const extraction = fileBuffer
      ? await extractDocumentContent(source, fileBuffer, mimeType)
      : { fullText: rawContent, pages: [{ pageNumber: 1, text: rawContent }] };

    if (!extraction.fullText.trim()) {
      return NextResponse.json({ detail: 'No extractable text found in file' }, { status: 400 });
    }

    // 2. Upload file to Cloud Storage (Cloudflare R2 or Dropbox)
    let storageProvider = 'r2';
    let fileKey = '';
    let previewUrl: string | null = null;
    let fileSize = fileBuffer ? fileBuffer.length : Buffer.byteLength(rawContent);

    if (fileBuffer) {
      const uploadRes = await uploadStorageFile({
        filename: source,
        buffer: fileBuffer,
        mimeType,
      });
      storageProvider = uploadRes.provider;
      fileKey = uploadRes.fileKey;
      previewUrl = uploadRes.publicUrl || null;
      fileSize = uploadRes.size;
    }

    // 3. Chunking with page and metadata retention — read config from ENV
    const chunkSize = parseInt(process.env.CHUNK_SIZE || '500', 10);
    const chunkOverlap = parseInt(process.env.CHUNK_OVERLAP || '50', 10);

    const chunks = chunkExtractedDocument({
      extraction,
      source,
      title,
      stream,
      semester,
      subject,
      module,
      chunkSize,
      chunkOverlap,
    });

    if (chunks.length === 0) {
      return NextResponse.json({ detail: 'Failed to split document into chunks' }, { status: 400 });
    }

    // 4. Generate Gemini Embeddings in batches
    const chunkTexts = chunks.map((c) => c.rawContent);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // 5. Insert Document record in NeonDB
    const docRes = await query(
      `INSERT INTO documents (
        title, source, mime_type, file_size_bytes, storage_provider, file_key, preview_url,
        dropbox_path, dropbox_shared_link, stream, semester, subject, module, uploaded_by, uploader_email, total_chunks
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, created_at;`,
      [
        title,
        source,
        mimeType,
        fileSize,
        storageProvider,
        fileKey || null,
        previewUrl || null,
        fileKey || null,
        previewUrl || null,
        stream,
        semester,
        subject,
        module,
        user.uid,
        user.email,
        chunks.length,
      ]
    );

    const docId = docRes.rows[0].id;

    // 6. Batch-insert all chunks in a single SQL statement (1 round trip instead of N)
    if (chunks.length > 0) {
      const BATCH_SIZE = 25; // Max chunks per INSERT to stay within postgres param limits
      for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
        const batchChunks = chunks.slice(batchStart, batchEnd);

        const valuePlaceholders: string[] = [];
        const batchParams: any[] = [];
        let paramIdx = 1;

        for (let i = 0; i < batchChunks.length; i++) {
          const c = batchChunks[i];
          const emb = embeddings[batchStart + i];
          const vectorStr = emb ? formatVector(emb) : null;

          valuePlaceholders.push(
            `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11}, $${paramIdx + 12})`
          );
          batchParams.push(
            docId,
            c.chunkIndex,
            c.totalChunks,
            c.rawContent,
            c.pageStart,
            c.pageEnd,
            c.source,
            c.title,
            c.stream,
            c.semester,
            c.subject,
            c.module,
            vectorStr
          );
          paramIdx += 13;
        }

        await query(
          `INSERT INTO document_chunks (
            document_id, chunk_index, total_chunks, raw_content, page_start, page_end,
            source, title, stream, semester, subject, module, embedding
          ) VALUES ${valuePlaceholders.join(', ')};`,
          batchParams
        );
      }
    }

    // 7. Audit log
    await logAudit({
      userId: user.uid,
      userEmail: user.email,
      role: user.role,
      action: 'document.ingest',
      targetType: 'document',
      details: {
        document_id: docId,
        title,
        source,
        chunks: chunks.length,
        size_bytes: fileSize,
        stream,
        semester,
        subject,
        module,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      },
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

    return NextResponse.json({
      document_id: docId,
      id: docId,
      title,
      source,
      stream,
      semester,
      subject,
      module,
      chunks_created: chunks.length,
      total_chunks: chunks.length,
      total_characters: extraction.fullText.length,
      time_taken_seconds: parseFloat(elapsed),
      storage_provider: storageProvider,
      file_key: fileKey,
      preview_url: previewUrl,
      dropbox_shared_link: previewUrl,
      message: `Successfully ingested "${title}" (${chunks.length} chunks) into ${storageProvider.toUpperCase()} storage in ${elapsed}s`,
    });
  } catch (err: any) {
    console.error('Document ingestion error:', err);
    return NextResponse.json({ detail: err.message || 'Ingestion failed' }, { status: 500 });
  }
}
