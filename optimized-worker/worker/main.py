"""
Siksha Saathi — Optimized Python Ingestion Worker (long-running).

Polls `ingestion_jobs` queue (FOR UPDATE SKIP LOCKED), downloads the
uploaded file, runs extraction → chunking → batch local embeddings →
chunk insert, and marks the job + document done.

Run alongside the existing Node worker — NOT a replacement.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
import time
from pathlib import Path
from typing import Optional

# Load .env from worker folder or parent
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

from .config import get_settings
from .db import query, execute, transaction, close_pool
from .storage import download_file
from .pipeline import extract_document
from .chunking import chunk_extracted_document
from .embeddings import embed_texts_via_service, format_vector, get_model_dim, wait_for_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("worker")

# Suppress noisy loggers
logging.getLogger("httpx").setLevel(logging.WARNING)


async def claim_next_job() -> Optional[dict]:
    """Claim the next pending ingestion job using FOR UPDATE SKIP LOCKED."""
    rows = await query(
        """
        UPDATE ingestion_jobs
        SET status = 'running', attempts = attempts + 1, locked_at = NOW(), updated_at = NOW()
        WHERE id IN (
            SELECT id FROM ingestion_jobs
            WHERE status = 'pending'
            ORDER BY created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, document_id, attempts, max_attempts;
        """
    )
    return rows[0] if rows else None


async def set_doc_progress(doc_id: str, progress: int) -> None:
    await execute(
        "UPDATE documents SET processing_progress = %s WHERE id = %s;",
        (progress, doc_id),
    )


async def finish_job(job_id: str, status: str, error: str = "") -> None:
    await execute(
        "UPDATE ingestion_jobs SET status = %s, error = %s, updated_at = NOW() WHERE id = %s;",
        (status, error or None, job_id),
    )


async def requeue_or_fail(job_id: str, attempts: int, max_attempts: int, error: str) -> None:
    if attempts < max_attempts:
        await execute(
            "UPDATE ingestion_jobs SET status = 'pending', error = %s, locked_at = NULL, updated_at = NOW() WHERE id = %s;",
            (error, job_id),
        )
    else:
        await finish_job(job_id, "failed", error)


async def log_audit(**kwargs) -> None:
    try:
        await execute(
            """INSERT INTO audit_logs (user_id, user_email, role, action, target_type, details)
               VALUES (%s, %s, %s, %s, %s, %s);""",
            (
                kwargs.get("user_id"),
                kwargs.get("user_email"),
                kwargs.get("role"),
                kwargs["action"],
                kwargs.get("target_type"),
                json.dumps(kwargs.get("details", {})),
            ),
        )
    except Exception as e:
        logger.warning("Audit log error: %s", e)


async def process_job(job: dict) -> dict:
    """Process a single ingestion job. Returns timing metadata."""
    doc_id = job["document_id"]
    job_id = job["id"]
    attempts = job["attempts"]
    max_attempts = job["max_attempts"]
    timings = {"job_id": job_id, "document_id": doc_id}

    logger.info("🔄 [Job %s] Processing document %s (attempt %d/%d)",
                job_id[:8], doc_id[:8], attempts, max_attempts)

    try:
        t_start = time.perf_counter()

        # Fetch document metadata
        docs = await query(
            """SELECT title, file_name, mime_type, storage_provider, file_key,
                      stream, semester, section, subject, module,
                      uploaded_by, uploader_email
               FROM documents WHERE id = %s;""",
            (doc_id,),
        )
        if not docs:
            await finish_job(job_id, "failed", "Document not found")
            return timings

        doc = docs[0]
        await set_doc_progress(doc_id, 30)

        # 1. Download
        t_dl = time.perf_counter()
        buffer = await download_file(doc["file_key"], doc.get("storage_provider", "r2"))
        timings["download_s"] = round(time.perf_counter() - t_dl, 4)

        if not buffer:
            raise RuntimeError("Could not download source file from storage.")

        # 2. Extraction
        t_ext = time.perf_counter()
        extraction = await extract_document(doc["file_name"], buffer, doc.get("mime_type", ""))
        timings["extraction_s"] = round(time.perf_counter() - t_ext, 4)
        timings.update({f"ext_{k}": v for k, v in extraction.timings.items()})

        if not extraction.full_text.strip():
            raise RuntimeError("No readable text content extracted from document.")

        await set_doc_progress(doc_id, 60)

        # 3. Chunking
        settings = get_settings()
        t_chunk = time.perf_counter()
        chunks = chunk_extracted_document(
            extraction=extraction,
            file_name=doc["file_name"],
            title=doc["title"],
            stream=doc.get("stream", "General"),
            semester=doc.get("semester", "General"),
            section=doc.get("section", "General"),
            subject=doc.get("subject", "General"),
            module=doc.get("module", "General"),
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )
        timings["chunking_s"] = round(time.perf_counter() - t_chunk, 4)
        timings["chunk_count"] = len(chunks)

        if not chunks:
            raise RuntimeError("Failed to generate chunks.")

        await set_doc_progress(doc_id, 80)

        # 4. Batch embeddings via embedding service (HTTP)
        t_emb = time.perf_counter()
        texts = [c.raw_content for c in chunks]
        embeddings = await embed_texts_via_service(texts, is_query=False)
        timings["embedding_s"] = round(time.perf_counter() - t_emb, 4)
        timings["embeddings_per_sec"] = round(len(texts) / timings["embedding_s"], 1) if timings["embedding_s"] > 0 else 0

        # 5. Batch insert chunks
        t_db = time.perf_counter()
        dim = get_model_dim()
        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch_chunks = chunks[i : i + batch_size]
            batch_embs = embeddings[i : i + batch_size]

            # Build parameterized INSERT
            placeholders = []
            params = []
            for j, (chunk, emb) in enumerate(zip(batch_chunks, batch_embs)):
                base = j * 18 + 1
                placeholders.append(
                    f"(${','.join(f'${base+k}' for k in range(18))})"
                        .replace("($", "(")
                        .replace(",", ", ")
                )
                # Use simple %s placeholders for psycopg
                vec_str = format_vector(emb)
                params.extend([
                    doc_id, chunk.chunk_index, chunk.total_chunks, chunk.raw_content,
                    chunk.page_start, chunk.page_end, chunk.paragraph_id,
                    chunk.chunk_type, chunk.char_start, chunk.char_end,
                    chunk.file_name, chunk.title, chunk.stream, chunk.semester,
                    chunk.section, chunk.subject, chunk.module, vec_str,
                ])

            # Build VALUES clause with %s placeholders
            values_parts = []
            for j in range(len(batch_chunks)):
                cols = ", ".join(["%s"] * 18)
                values_parts.append(f"({cols})")

            # Replace last %s with ::vector cast
            sql = f"""
                INSERT INTO document_chunks (
                    document_id, chunk_index, total_chunks, raw_content,
                    page_start, page_end, paragraph_id, chunk_type, char_start, char_end,
                    file_name, title, stream, semester, section, subject, module, embedding
                ) VALUES {', '.join(values_parts)};
            """
            # Replace the last %s in each value group with %s::vector
            # We need to replace every 18th %s with %s::vector
            # Simpler: just do the insert row by row for correctness
            for j, (chunk, emb) in enumerate(zip(batch_chunks, batch_embs)):
                vec_str = format_vector(emb)
                await execute(
                    """INSERT INTO document_chunks (
                        document_id, chunk_index, total_chunks, raw_content,
                        page_start, page_end, paragraph_id, chunk_type, char_start, char_end,
                        file_name, title, stream, semester, section, subject, module, embedding_local
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector(384));""",
                    (
                        doc_id, chunk.chunk_index, chunk.total_chunks, chunk.raw_content,
                        chunk.page_start, chunk.page_end, chunk.paragraph_id,
                        chunk.chunk_type, chunk.char_start, chunk.char_end,
                        chunk.file_name, chunk.title, chunk.stream, chunk.semester,
                        chunk.section, chunk.subject, chunk.module, vec_str,
                    ),
                )

        timings["db_write_s"] = round(time.perf_counter() - t_db, 4)

        # 6. Complete
        await execute(
            "UPDATE documents SET status = 'ready', processing_progress = 100, total_chunks = %s, error_message = NULL WHERE id = %s;",
            (len(chunks), doc_id),
        )
        await finish_job(job_id, "done")

        await log_audit(
            user_id=doc.get("uploaded_by"),
            user_email=doc.get("uploader_email"),
            role="system",
            action="document.ingest.completed.optimized",
            target_type="document",
            details={"docId": doc_id, "title": doc["title"], "chunks": len(chunks), "timings": timings},
        )

        timings["total_s"] = round(time.perf_counter() - t_start, 4)
        logger.info(
            "✅ [Job %s] Document \"%s\" indexed with %d chunks in %.2fs",
            job_id[:8], doc["title"], len(chunks), timings["total_s"],
        )

    except Exception as e:
        logger.error("❌ [Job %s] Failed: %s", job_id[:8], e)
        try:
            await execute(
                "UPDATE documents SET status = 'failed', error_message = %s, processing_progress = 0 WHERE id = %s;",
                (str(e), doc_id),
            )
        except Exception:
            pass
        await log_audit(
            action="document.ingest.failed.optimized",
            target_type="document",
            details={"docId": doc_id, "jobId": job_id, "error": str(e)},
        )
        await requeue_or_fail(job_id, attempts, max_attempts, str(e))

    return timings


async def main_loop() -> None:
    """Main worker polling loop."""
    settings = get_settings()
    poll_ms = settings.poll_interval_ms

    # Wait for embedding service
    logger.info("🚀 Optimized Python ingestion worker starting...")
    logger.info("⏳ Waiting for embedding service...")
    ready = await wait_for_service(max_wait_s=120)
    if not ready:
        logger.error("❌ Embedding service not available. Exiting.")
        return
    logger.info("✅ Embedding service is ready")

    logger.info("🔄 Polling for jobs every %dms...", poll_ms)

    while True:
        try:
            job = await claim_next_job()
            if job:
                timings = await process_job(job)
                if settings.benchmark_mode:
                    results_dir = Path(__file__).parent.parent.parent / "benchmark" / "results"
                    results_dir.mkdir(parents=True, exist_ok=True)
                    with open(results_dir / "latest-ingestion-timings.json", "a") as f:
                        f.write(json.dumps(timings) + "\n")
            else:
                await asyncio.sleep(poll_ms / 1000)
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error("Loop error: %s", e)
            await asyncio.sleep(poll_ms / 1000)


async def shutdown() -> None:
    logger.info("Shutting down...")
    await close_pool()


def run() -> None:
    loop = asyncio.new_event_loop()

    def handle_signal(sig, frame):
        loop.create_task(shutdown())
        loop.stop()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    try:
        loop.run_until_complete(main_loop())
    except KeyboardInterrupt:
        pass
    finally:
        loop.run_until_complete(shutdown())
        loop.close()


if __name__ == "__main__":
    run()
