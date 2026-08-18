# Siksha Saathi

AI-powered academic tutoring, institutional intelligence, and automated examination platform for higher education. Curriculum-aligned Socratic tutoring, hybrid vector+full-text retrieval, a separate long-running ingestion/OCR worker, study-material distribution with stream/semester/section/subject scoping, and role-based institutional analytics.

---

## Core Features

### Student Portal
- **Socratic AI Tutor**: streaming Gemini chat that guides via probing questions; answers are strictly grounded in the student's own course materials.
- **Hybrid RAG (Vector + Full-Text RRF)**: pgvector cosine + `tsvector` keyword search via Reciprocal Rank Fusion. Full-text uses the `simple` config — **multilingual** (English, Hindi, …) content is searchable.
- **Chunk-level citations**: the LLM cites `[[#n]]` ordinals; the UI renders inline clickable chips that open a cited-passage highlight panel + deep-link the PDF page. Every cited chunk carries `paragraph_id`, `chunk_type`, `char_start/char_end`, `file_name`.
- **Scoped materials**: a student only ever sees/retrieves chunks matching their **stream + semester + section** (with per-dimension `General` wildcards). Subject/file filters available in-chat and in-exam.
- **Adaptive Quizzes**: MCQ generation scoped to the student's materials, with subject + file filters.
- **No self-registration**: students are admin-enrolled (CSV) with all academic fields required; Google login only succeeds if the email is pre-enrolled. Students cannot self-edit stream/semester/section/roll.

### Faculty & Admin Dashboard
- **Separate ingestion worker** (`/ingestion-worker`) deployed as a long-running service (e.g. Render) — text extraction, per-page OCR, and Gemini embeddings run without serverless timeouts. The web app only enqueues a DB job (`ingestion_jobs`) and returns `202`.
- **Roles**: `admin` (full access), `hod` (their stream, incl. faculty performance), `faculty` (what they teach), `student`. `superuser`/`assistant` removed.
- **Manage Faculty** page: create/update HODs/faculty, assign stream+department+role, reset passwords, delete (guards against last-admin removal / self-delete).
- **Faculty Performance**: HOD sees faculty in their stream — subjects/semesters/sections each teaches + per-subject query heatmaps.
- **Analytics**: per-subject/per-material heatmaps built from `query_citations` (every cited material increments, not just the top chunk). Role-scoped — no cross-stream leakage.
- **Curriculum management**, **student enrollment**, **audit logging**.

---

## Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Web app** | Next.js 16 (App Router, Turbopack) — deployed to Vercel (slim bundle; no heavy ingestion deps) |
| **Ingestion worker** | Standalone Node/TS service (`/ingestion-worker`) — deployed to Render (long-running) |
| **Database** | PostgreSQL (NeonDB) + `pgvector` (HNSW) + Drizzle ORM |
| **Search** | Hybrid: pgvector cosine + `tsvector` (`simple`/multilingual) via RRF |
| **LLM/Embeddings** | Google Gemini (multilingual) — `batchEmbedContents` for ingestion throughput |
| **OCR** | Tesseract.js (singleton worker, multilingual `eng+hin` by default via `TESSERACT_LANGS`) |
| **PDF** | pdfjs-dist (per-page text + render image-only pages to canvas for OCR) |
| **Storage** | Cloudflare R2 (S3) / Dropbox |
| **Auth** | `httpOnly` cookies, Next.js Proxy, JWT (`jose`), `bcryptjs`, Google OAuth 2.0 |

---

## Roles & Scoping

| Role | Sees |
|---|---|
| `admin` | Everything (all streams, all faculty, all students, curriculum, enrollment) |
| `hod` | Their **stream** only — students, documents, analytics, and faculty performance for that stream |
| `faculty` | Documents **they uploaded** (what they teach) + analytics on those materials |
| `student` | Chunks matching their stream+semester+section (+ `General` per dimension) |

Scoping is enforced server-side in every retrieval/analytics/listing route via `src/lib/server/analyticsScope.ts`. `document_id` filters are AND-ed with scope (never bypass). HOD/faculty cannot self-reassign their stream.

---

## Project Structure

```
siksha-saathi/
├── ingestion-worker/           # ⬅ Separate deployable ingestion service (Render)
│   └── src/                    #   pipeline (pdfjs/ocr/officeparser), batchEmbedContents, job loop
├── db-scripts/                 # init, seed, validate, clear, reset (idempotent source->file_name renames)
├── src/
│   ├── app/
│   │   ├── (auth)/login        # Student login (no registration)
│   │   ├── (student)/         # chat, resources, exam (with subject/file filters)
│   │   ├── admin/(dashboard)/ # knowledge-base, add-document, add-text, students, faculty,
│   │   │                       #   faculty-performance, analytics, manage-curriculum, user-settings
│   │   └── api/v1/            # REST + SSE: query/stream, search, quiz, documents, filters,
│   │                          #   analytics (overview/stream/subject/student/faculty), admin/users
│   ├── components/            # student + admin UI (chat chips, FilePreview highlight, Sidebar)
│   ├── context/              # StudentAuth, AdminAuth, Chat, Toast
│   ├── db/schema.ts          # Drizzle schema (student_users.section, documents.file_name, etc.)
│   └── lib/server/           # db, auth (+getDashboardProfile), analyticsScope, llm, storage, audit, embeddings
├── architecture.md
└── .env.example
```

---

## Database CLI

```bash
npm run db:setup      # init (creates tables, indexes, idempotent source->file_name rename) + seed + validate
npm run db:init       # apply schema (idempotent — safe on existing DBs)
npm run db:seed       # seed admin (SEED_ADMIN_*) + curriculum
npm run db:validate   # health check (tables, indexes, extensions)
npm run db:clear      # truncate all
npm run db:reset      # drop + recreate
npm run db:generate   # sync drizzle migrations from schema.ts (if you use drizzle-kit)
```

---

## Getting Started

### Web app
```bash
npm install
npm run db:setup          # sets DATABASE_URL, SEED_ADMIN_* in .env.local first
npm run dev               # http://localhost:3000
```
Admin login: `admin@sikshasaathi.in` / `admin123` (from `SEED_ADMIN_*` — **change before production**).

### Ingestion worker (run locally or deploy to Render)
```bash
cd ingestion-worker
cp .env.example .env      # DATABASE_URL (same as web), GEMINI_API_KEY, R2_*/DROPBOX_*, TESSERACT_LANGS
npm install
npm run dev               # polls ingestion_jobs, processes extraction/OCR/embeddings
```
Or from repo root: `npm run worker:install && npm run worker:dev`. See `ingestion-worker/README.md` for Render deployment.

> **The worker must be running** for uploaded documents to be indexed. The web app enqueues; the worker does the heavy work (no timeout pressure). Without it, documents stay `processing`.

---

## Environment

Key variables (see `.env.example` / `ingestion-worker/.env.example`):

```env
DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIM=768
JWT_SECRET=...
SEED_ADMIN_EMAIL=admin@sikshasaathi.in
SEED_ADMIN_PASSWORD=admin123
# R2 / Dropbox / Google OAuth ...
```
Students are **admin-enrolled only** — no `DEFAULT_STUDENT_*` academic env vars. The enroll CSV requires `email,name,roll,stream,sem,section`; the admin sets a batch initial password per import.

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/query/stream` | Socratic RAG SSE stream; scope + subject/file filters; chunk-level `[[#n]]` citations; writes `query_citations` |
| `POST` | `/api/v1/search` | Hybrid RRF search (scoped) |
| `POST` | `/api/v1/quiz/generate` | Scoped MCQ generation with subject/file/module filters |
| `POST` | `/api/v1/quiz/submit` | Evaluate + record telemetry |
| `GET`  | `/api/v1/documents` | List materials (student/hod/faculty scoped) |
| `POST` | `/api/v1/ingest` | Enqueue ingestion job (202) — worker processes async |
| `GET`  | `/api/v1/documents/:id/chunks/:chunkId` | Single chunk + preview URL (for citation highlight, scope-checked) |
| `GET`  | `/api/v1/filters` | streams, semesters, **sections**, subjects, scoped **files**, curriculum |
| `GET`  | `/api/v1/analytics/overview` | Role-scoped totals, at-risk, weak domains, weekly |
| `GET`  | `/api/v1/analytics/stream` | Per-subject + per-material heatmap (scoped) |
| `GET`  | `/api/v1/analytics/faculty` | Faculty performance (HOD: their stream; admin: all; faculty: self) |
| `POST` | `/api/v1/admin/users` | Create faculty/HOD/admin (admin only) |
| `PATCH/DELETE` | `/api/v1/admin/users/:uid` | Update / delete faculty (guards: last admin, self-delete) |
| `POST` | `/api/v1/admin/users/:uid/password` | Reset password |
