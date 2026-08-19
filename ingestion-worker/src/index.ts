/**
 * Siksha Saathi — Ingestion Worker (long-running).
 *
 * Polls the `ingestion_jobs` queue (FOR UPDATE SKIP LOCKED), downloads the
 * uploaded file, runs extraction -> chunking -> batch embeddings -> chunk
 * insert, and marks the job + document done. Deploy separately (e.g. Render).
 */
// Load .env from the worker folder or the parent (local dev). No-op in prod
// where env vars are set by the host.
try { (process as any).loadEnvFile?.('.env'); } catch {}
try { (process as any).loadEnvFile?.('../.env.local'); } catch {}

import { query, withTransaction, endPool } from './db.js';
import { logAudit } from './audit.js';
import { downloadFile } from './storage.js';
import { extractDocumentContent, chunkExtractedDocument, ExtractionResult } from './pipeline.js';
import { getBatchEmbeddings, formatVector } from './embeddings.js';
import type { PoolClient } from 'pg';

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const MAX_ATTEMPTS_DEFAULT = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface JobRow {
  id: string;
  document_id: string;
  attempts: number;
  max_attempts: number;
}

async function claimNextJob(): Promise<JobRow | null> {
  return withTransaction(async (client: PoolClient) => {
    const res = await client.query(
      `UPDATE ingestion_jobs
       SET status = 'running', attempts = attempts + 1, locked_at = NOW(), updated_at = NOW()
       WHERE id IN (
         SELECT id FROM ingestion_jobs
         WHERE status = 'pending'
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, document_id, attempts, max_attempts;`
    );
    return (res.rows[0] as JobRow | undefined) || null;
  });
}

async function setDocProgress(docId: string, progress: number) {
  await query('UPDATE documents SET processing_progress = $1 WHERE id = $2;', [progress, docId]);
}

async function finishJob(jobId: string, status: 'done' | 'failed', error?: string) {
  await query(
    `UPDATE ingestion_jobs SET status = $1, error = $2, updated_at = NOW() WHERE id = $3;`,
    [status, error || null, jobId]
  );
}

async function requeueOrFail(jobId: string, attempts: number, maxAttempts: number, error: string) {
  // Requeue for another attempt if budget remains; else fail permanently.
  if (attempts < maxAttempts) {
    await query(
      `UPDATE ingestion_jobs SET status = 'pending', error = $1, locked_at = NULL, updated_at = NOW() WHERE id = $2;`,
      [error, jobId]
    );
  } else {
    await finishJob(jobId, 'failed', error);
  }
}

async function processJob(job: JobRow) {
  const { document_id: docId, id: jobId, attempts, max_attempts } = job;
  console.log(`🔄 [Job ${jobId}] Processing document ${docId} (attempt ${attempts}/${max_attempts})`);

  try {
    const docRes = await query(
      `SELECT title, file_name, mime_type, storage_provider, file_key,
              stream, semester, section, subject, module,
              uploaded_by, uploader_email
       FROM documents WHERE id = $1;`,
      [docId]
    );
    if (docRes.rowCount === 0) {
      await finishJob(jobId, 'failed', 'Document not found');
      return;
    }
    const doc = docRes.rows[0] as any;

    await setDocProgress(docId, 30);

    // Download the original file from storage
    let buffer: Buffer | null = null;
    if (doc.file_key) {
      buffer = await downloadFile(doc.file_key, doc.storage_provider);
    }
    if (!buffer) {
      throw new Error('Could not download the source file from storage.');
    }

    // 1. Extraction
    const extraction: ExtractionResult = await extractDocumentContent(
      doc.file_name,
      buffer,
      doc.mime_type
    );
    if (!extraction.fullText.trim()) {
      throw new Error('No readable text content extracted from document.');
    }

    await setDocProgress(docId, 60);

    // 2. Chunking
    const chunks = chunkExtractedDocument({
      extraction,
      fileName: doc.file_name,
      title: doc.title,
      stream: doc.stream,
      semester: doc.semester,
      section: doc.section,
      subject: doc.subject,
      module: doc.module,
    });
    if (chunks.length === 0) throw new Error('Failed to generate chunks.');

    await setDocProgress(docId, 80);

    // 3. Batch embeddings (optimized: batchEmbedContents)
    const embeddings = await getBatchEmbeddings(chunks.map((c) => c.rawContent));

    // 4. Batch insert chunks
    const BATCH = 100;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const sliceEmbeddings = embeddings.slice(i, i + BATCH);
      const values: string[] = [];
      const params: any[] = [];
      let p = 1;
      for (let j = 0; j < slice.length; j++) {
        const chunk = slice[j];
        const emb = sliceEmbeddings[j];
        const vectorStr = emb && emb.length > 0 ? formatVector(emb) : null;
        values.push(
          `($${p},$${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},$${p + 6},$${p + 7},$${p + 8},$${p + 9},$${p + 10},$${p + 11},$${p + 12},$${p + 13},$${p + 14},$${p + 15},$${p + 16},$${p + 17}::vector)`
        );
        params.push(
          docId, chunk.chunkIndex, chunk.totalChunks, chunk.rawContent,
          chunk.pageStart ?? null, chunk.pageEnd ?? null, chunk.paragraphId ?? null,
          chunk.chunkType ?? 'text', chunk.charStart ?? null, chunk.charEnd ?? null,
          chunk.fileName, chunk.title ?? null, chunk.stream, chunk.semester,
          chunk.section, chunk.subject, chunk.module, vectorStr
        );
        p += 18;
      }
      await query(
        `INSERT INTO document_chunks (
           document_id, chunk_index, total_chunks, raw_content,
           page_start, page_end, paragraph_id, chunk_type, char_start, char_end,
           file_name, title, stream, semester, section, subject, module, embedding
         ) VALUES ${values.join(',')};`,
        params
      );
    }

    // 5. Complete
    await query(
      `UPDATE documents
       SET status = 'ready', processing_progress = 100, total_chunks = $1, error_message = NULL
       WHERE id = $2;`,
      [chunks.length, docId]
    );
    await finishJob(jobId, 'done');

    await logAudit({
      userId: doc.uploaded_by,
      userEmail: doc.uploader_email,
      role: 'system',
      action: 'document.ingest.completed',
      targetType: 'document',
      details: { docId, title: doc.title, chunks: chunks.length },
    });

    console.log(`✅ [Job ${jobId}] Document "${doc.title}" indexed with ${chunks.length} chunks.`);
  } catch (err: any) {
    console.error(`❌ [Job ${jobId}] Failed:`, err.message);
    await query(
      `UPDATE documents SET status = 'failed', error_message = $1, processing_progress = 0 WHERE id = $2;`,
      [err.message, docId]
    ).catch(() => {});
    await logAudit({
      action: 'document.ingest.failed',
      targetType: 'document',
      details: { docId, jobId, error: err.message },
    }).catch(() => {});
    await requeueOrFail(jobId, attempts, max_attempts || MAX_ATTEMPTS_DEFAULT, err.message);
  }
}

async function loop() {
  console.log('🚀 Ingestion worker started. Polling for jobs...');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const job = await claimNextJob();
      if (job) {
        await processJob(job);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err: any) {
      console.error('Loop error:', err.message);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  await endPool();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

loop();
