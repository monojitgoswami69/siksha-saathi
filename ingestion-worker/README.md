# Siksha Saathi — Ingestion Worker

Long-running service that owns the heavy ingestion pipeline (text extraction,
per-page OCR, Gemini embeddings, chunk insert). Deploy **separately** from the
Next.js web app (e.g. on Render) so it isn't bound by serverless timeouts.

## How it works
1. The web app's `POST /api/v1/ingest` route authenticates, scopes, uploads the
   file to R2/Dropbox, creates a `documents` row (`status=processing`), inserts
   an `ingestion_jobs` row (`status=pending`), and returns `202` immediately.
2. This worker polls `ingestion_jobs` (`FOR UPDATE SKIP LOCKED`), claims a job,
   downloads the file from storage, runs the pipeline, and marks it done.
3. The web app's knowledge-base page polls `documents.status`/`processing_progress`
   until `ready`.

## Run locally
```bash
cd ingestion-worker
cp .env.example .env          # fill in DATABASE_URL, GEMINI_API_KEY, R2_* / DROPBOX_*
npm install
npm run dev                   # tsx watch (auto-reload)
```
Or from the repo root: `npm run worker:install && npm run worker:dev`.

> The worker reuses the root `node_modules` for native deps during local dev.
> On Render, run `npm install` inside this folder so its own `package.json`
> deps are installed.

## Deploy on Render
1. **New → Web Service** → connect this repo.
2. **Root Directory**: `ingestion-worker`.
3. **Build**: `npm install && npm run build`.
4. **Start**: `npm start` (runs `node dist/index.js`).
5. **Environment variables**: copy from `.env.example` (DATABASE_URL must match
   the web app's NeonDB).
6. **Instance type**: a small persistent instance is enough; OCR for large
   scanned PDFs is memory/CPU-bound — pick a size with ≥512MB RAM if you expect
   scanned textbooks.

## Tuning (env)
- `POLL_INTERVAL_MS` — poll frequency (default 5000).
- `OCR_MAX_PAGES` — cap on per-document OCR-rendered pages (default 50) to bound
  runtime for huge scanned books (remaining pages stay text-only).
- `OCR_MIN_TEXT_CHARS` — per-page text density below which OCR is triggered (default 20).
- `CHUNK_SIZE` / `CHUNK_OVERLAP` (default 500 / 50).
- `TESSERACT_LANGS` — OCR language(s), e.g. `eng` or `eng+hin` (default `eng`).

## Retry behavior
A failed job is requeued (`status=pending`) until `max_attempts` (default 3),
then marked `failed` with the error on both `ingestion_jobs` and `documents`.
