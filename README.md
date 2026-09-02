# Siksha Saathi

AI-powered academic tutoring, institutional intelligence, and automated examination platform for higher education. Curriculum-aligned Socratic tutoring, hybrid vector+full-text retrieval, local embedding service, PyMuPDF-based ingestion, study-material distribution with stream/semester/section/subject scoping, and role-based institutional analytics.

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
- **Background ingestion worker** (`/optimized-worker`) — text extraction (PyMuPDF), per-page OCR, and local E5 embeddings run without serverless timeouts. The web app only enqueues a DB job and returns `202`.
- **Roles**: `admin` (full access), `hod` (their stream, incl. faculty performance), `faculty` (what they teach), `student`.
- **Manage Faculty** page: create/update HODs/faculty, assign stream+department+role, reset passwords, delete (guards against last-admin removal / self-delete).
- **Faculty Performance**: HOD sees faculty in their stream — subjects/semesters/sections each teaches + per-subject query heatmaps.
- **Analytics**: per-subject/per-material heatmaps built from `query_citations` (every cited material increments, not just the top chunk). Role-scoped — no cross-stream leakage.
- **Curriculum management**, **student enrollment**, **audit logging**.

---

## Architecture & Tech Stack

Siksha Saathi runs as a **three-process local stack**:

| Process | Technology | Port | Role |
|---|---|---|---|
| **Web app** | Next.js 16 (App Router, Turbopack) | `:3000` | UI, API routes, query pipeline, Gemini streaming |
| **Embedding service** | FastAPI + `intfloat/multilingual-e5-small` | `:8100` | Loads model ONCE, serves `/embed` and `/embed/batch` |
| **Ingestion worker** | Python (PyMuPDF, pytesseract, httpx) | background | Job polling, extraction, OCR, chunking, embedding via service |

| Layer | Technology |
|---|---|
| **Database** | PostgreSQL (NeonDB) + `pgvector` (HNSW) + Drizzle ORM |
| **Search** | Hybrid: pgvector cosine + `tsvector` (`simple`/multilingual) via RRF |
| **LLM** | Google Gemini (streaming Socratic chat, quiz generation) |
| **Embeddings** | `intfloat/multilingual-e5-small` (384-dim, local, ~6ms warm query) |
| **PDF** | PyMuPDF (C library, ~10ms for 5MB PDF) |
| **OCR** | pytesseract (eng+hin) |
| **Storage** | Cloudflare R2 (S3) / Dropbox |
| **Auth** | `httpOnly` cookies, JWT (`jose`), `bcryptjs`, Google OAuth 2.0 |

See [`architecture.md`](architecture.md) for detailed data flow diagrams and module breakdown.

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
├── src/                          # Next.js application
│   ├── app/
│   │   ├── (auth)/login          # Student login (no registration)
│   │   ├── (student)/            # Chat, resources, exam (with subject/file filters)
│   │   ├── admin/(dashboard)/    # Knowledge-base, add-document, students, faculty,
│   │   │                         #   faculty-performance, analytics, manage-curriculum
│   │   └── api/v1/               # REST + SSE routes
│   ├── components/               # Student + admin UI components
│   ├── context/                  # StudentAuth, AdminAuth, Chat, Toast
│   ├── db/schema.ts              # Drizzle ORM schema
│   └── lib/server/               # Server modules:
│       ├── embeddingRouter.ts    #   → routes to local embedding service
│       ├── localEmbeddings.ts    #   → HTTP client for localhost:8100
│       ├── llm.ts                #   → Gemini streaming
│       ├── analyticsScope.ts     #   → role-based scoping
│       ├── auth.ts               #   → JWT, OAuth, sessions
│       ├── db.ts                 #   → PostgreSQL pool
│       ├── storage.ts            #   → R2 / Dropbox
│       └── audit.ts              #   → action logging
│
├── embedding-service/            # FastAPI embedding microservice
│   └── app/
│       ├── main.py               # FastAPI app (lifespan model loading)
│       ├── model.py              # SentenceTransformer singleton
│       ├── cache.py              # LRU cache (2000 entries)
│       ├── schemas.py            # Request/response models
│       └── config.py             # Pydantic Settings
│
├── optimized-worker/             # Python ingestion worker
│   └── worker/
│       ├── main.py               # Job polling loop
│       ├── pipeline.py           # PyMuPDF + OCR extraction
│       ├── chunking.py           # Paragraph-aware splitting
│       ├── embeddings.py         # HTTP client for embedding service
│       ├── db.py                 # Async psycopg3 pool
│       ├── storage.py            # R2/Dropbox download
│       ├── ocr.py                # pytesseract wrapper
│       └── config.py             # Pydantic Settings
│
├── db-scripts/                   # Database management scripts
├── drizzle/                      # Drizzle ORM migrations
├── scripts/                      # Utility scripts (Dropbox token)
├── docker-compose.yml            # Multi-container Docker Compose orchestration
└── architecture.md               # Detailed architecture documentation
```

---

## Database CLI

```bash
npm run db:setup      # init + seed + validate (run once)
npm run db:init       # apply schema (idempotent)
npm run db:seed       # seed admin + curriculum
npm run db:validate   # health check (tables, indexes, extensions)
npm run db:clear      # truncate all
npm run db:reset      # drop + recreate
npm run db:generate   # sync drizzle migrations from schema.ts
```

---

## Getting Started

### Unified Docker Stack (Recommended)

Run the entire stack (PostgreSQL with pgvector, FastAPI embedding service, ingestion worker, and Next.js web) natively in containers with zero host configuration:

```bash
# 1. Copy environment variables
cp .env.example .env.local

# 2. Build & launch all services
npm run docker:up
# or: docker compose up -d

# 3. View live status & logs
npm run docker:ps
npm run docker:logs

# 4. Stop all services cleanly
npm run docker:down
# or: docker compose down
```

- **Next.js Web UI**: [http://localhost:3000](http://localhost:3000)
- **Embedding & Reranker Service**: [http://localhost:8100/health](http://localhost:8100/health)
- **PostgreSQL Database**: `localhost:5432` (`siksha_saathi`)
- **Default Admin Login**: `admin@sikshasaathi.in` / `admin123`

---

### Running Services Individually (Manual Development)

If running directly on the host machine without Docker containers:

#### Prerequisites
- Node.js 20+
- Python 3.9+ with pip
- PostgreSQL 16 with pgvector extension

#### 1. Setup Dependencies
```bash
npm install
cp .env.example .env.local

cd optimized-worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../embedding-service
pip install -r requirements.txt
cd ..
```

#### 2. Start Services Individually
```bash
# 1. Embedding service (terminal 1)
source optimized-worker/.venv/bin/activate
cd embedding-service && uvicorn app.main:app --host 127.0.0.1 --port 8100

# 2. Next.js (terminal 2)
npm run dev

# 3. Ingestion worker (terminal 3)
source optimized-worker/.venv/bin/activate
python -m worker.main
```

> **The embedding service must be running** before Next.js or the worker can process queries/ingestion.
> **The worker must be running** for uploaded documents to be indexed. Without it, documents stay `processing`.

---

## Environment

Key variables (see `.env.example` / `embedding-service/.env.example`):

```env
DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash-lite
JWT_SECRET=...
SEED_ADMIN_EMAIL=admin@sikshasaathi.in
SEED_ADMIN_PASSWORD=admin123
# R2 / Dropbox / Google OAuth ...
```

Embedding service (in `embedding-service/.env`):
```env
EMBEDDING_MODEL=intfloat/multilingual-e5-small
EMBEDDING_DIM=384
EMBEDDING_PORT=8100
EMBEDDING_CACHE_MAX_SIZE=2000
```

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
| `GET`  | `/api/v1/filters` | streams, semesters, sections, subjects, scoped files, curriculum |
| `GET`  | `/api/v1/analytics/overview` | Role-scoped totals, at-risk, weak domains, weekly |
| `GET`  | `/api/v1/analytics/stream` | Per-subject + per-material heatmap (scoped) |
| `GET`  | `/api/v1/analytics/faculty` | Faculty performance (HOD: their stream; admin: all; faculty: self) |
| `POST` | `/api/v1/admin/users` | Create faculty/HOD/admin (admin only) |
| `PATCH/DELETE` | `/api/v1/admin/users/:uid` | Update / delete faculty (guards: last admin, self-delete) |
| `POST` | `/api/v1/admin/users/:uid/password` | Reset password |

### Embedding Service API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `localhost:8100/health` | Service readiness (`starting` / `ready`) |
| `POST` | `localhost:8100/embed` | Single text → 384-dim vector (LRU cached) |
| `POST` | `localhost:8100/embed/batch` | Batch texts → list of vectors |
| `GET` | `localhost:8100/metrics` | Cache hits/misses/size, uptime |
