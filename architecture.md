# Siksha Saathi — System Architecture

## Overview

Siksha Saathi runs as a **three-process local development stack**:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        LOCAL DEVELOPMENT                            │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   Next.js       │    │ Embedding        │    │ Python          │  │
│  │   localhost:3000 │    │ Service          │    │ Ingestion       │  │
│  │                 │    │ localhost:8100   │    │ Worker          │  │
│  │ • UI            │    │                 │    │                 │  │
│  │ • API routes    │    │ • E5-small      │    │ • PyMuPDF       │  │
│  │ • Query pipeline│    │   loaded ONCE   │    │ • OCR           │  │
│  │ • Gemini LLM    │    │ • LRU cache     │    │ • Chunking      │  │
│  │   streaming     │    │ • /embed        │    │ • Job polling   │  │
│  └────────┬────────┘    │ • /embed/batch  │    └────────┬────────┘  │
│           │             │ • /health       │             │            │
│           │ POST /embed └────────┬────────┘ POST        │            │
│           └──────────────────────►         /embed/batch  │            │
│                                  ◄──────────────────────┘            │
│                                  │                                    │
│                                  ▼                                    │
│                        PostgreSQL / Neon                              │
│                        + pgvector (HNSW)                              │
│                        embedding_local (384d)                         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Three-Process Architecture

### 1. Next.js Application (`src/`)

The main web application — UI, API routes, authentication, query pipeline, and Gemini LLM streaming.

**Query path:**
```
User query
  → POST /api/v1/query/stream
  → HTTP call to embedding service (POST http://127.0.0.1:8100/embed)
  → 384-dim E5-small vector returned
  → pgvector hybrid search (cosine + full-text RRF) on `embedding_local` column
  → Context construction
  → Gemini streaming response with [[#n]] citations
```

The Next.js app does **NOT** load the embedding model. It makes an HTTP call to the embedding service and receives back a vector. This keeps the Node.js process lightweight (~100MB) and eliminates cold-start latency.

**Key server modules:**

| Module | Role |
|---|---|
| `embeddingRouter.ts` | Routes all embedding calls to the local service |
| `localEmbeddings.ts` | HTTP client for `http://127.0.0.1:8100/embed` |
| `llm.ts` | Gemini streaming (Socratic chat, quiz generation) |
| `analyticsScope.ts` | Role-based scoping (admin/hod/faculty/student) |
| `auth.ts` | JWT cookies, Google OAuth, session management |
| `db.ts` | PostgreSQL connection pool (NeonDB) |
| `storage.ts` | Cloudflare R2 / Dropbox file storage |
| `audit.ts` | Action logging |

---

### 2. Embedding Service (`embedding-service/`)

A standalone **FastAPI** (Python) microservice that loads `intfloat/multilingual-e5-small` **once at startup** and serves embeddings over HTTP.

**Why a separate process?**
- Model initialization takes ~6 seconds and consumes ~450MB RAM
- Loading it once and keeping it alive means zero per-query initialization cost
- Both Next.js and the ingestion worker share the same model instance via HTTP
- The LRU cache (2000 entries) makes repeated query embeddings sub-millisecond

**Lifecycle:**
```
Process starts
  → Load intfloat/multilingual-e5-small (~6s)
  → Warmup inference
  → /health returns { "status": "ready" }
  → Accept requests on :8100
```

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | `{ "status": "starting" \| "ready" }` |
| `POST` | `/embed` | Single text → 384-dim vector (cached for queries) |
| `POST` | `/embed/batch` | Batch texts → list of vectors (for ingestion) |
| `GET` | `/metrics` | Cache hits/misses/size, uptime |

**E5 conventions applied internally:**
- Query text gets prefix: `"query: <text>"`
- Document text gets prefix: `"passage: <text>"`
- All embeddings are L2-normalized
- Dimensionality: 384

**Measured performance (Apple M5, 16GB):**

| Metric | Measured |
|---|---|
| Model load (cold) | ~6.2s |
| Warm query p50 | 6.2ms |
| Warm query p95 | 10.3ms |
| Cache hit | 0.76ms |
| HTTP overhead (localhost) | 0.93ms |
| Batch throughput (32 texts) | 1,756 texts/sec |
| Memory (RSS) | ~414MB |

---

### 3. Python Ingestion Worker (`optimized-worker/`)

A background worker that polls `ingestion_jobs`, downloads uploaded files, extracts text, chunks, gets embeddings via the embedding service, and writes to the database.

**Pipeline:**
```
Poll ingestion_jobs (FOR UPDATE SKIP LOCKED)
  → Download file from R2/Dropbox
  → Extract text (PyMuPDF for PDF, python-docx, python-pptx, markdown)
  → OCR (pytesseract, eng+hin) for image-only pages
  → Paragraph-aware chunking (configurable size/overlap)
  → POST /embed/batch to embedding service
  → INSERT chunks with embedding_local vectors
  → Mark job done, document ready
```

The worker does **NOT** load the embedding model. It calls `http://127.0.0.1:8100/embed/batch`.

**Key modules:**

| Module | Role |
|---|---|
| `pipeline.py` | PDF/DOCX/PPTX/MD text extraction (PyMuPDF) |
| `ocr.py` | pytesseract wrapper (eng+hin) |
| `chunking.py` | Paragraph-aware splitting with overlap |
| `embeddings.py` | HTTP client for embedding service |
| `db.py` | Async psycopg3 connection pool |
| `storage.py` | R2/Dropbox download |
| `config.py` | Pydantic Settings |
| `main.py` | Job polling loop, claim/process/complete |

---

## Database

**PostgreSQL (NeonDB)** with `pgvector` extension.

### Vector Storage

The `document_chunks` table has the vector column:

```sql
embedding_local vector(384)  -- E5-small embeddings (HNSW indexed)
```

An HNSW index enables fast cosine similarity search:
```sql
CREATE INDEX idx_chunks_embedding_local
  ON document_chunks USING hnsw (embedding_local vector_cosine_ops);
```

### Retrieval Strategy

**Hybrid search** using Reciprocal Rank Fusion (RRF):

1. **Vector search:** `embedding_local <=> query_vector` (cosine distance via pgvector)
2. **Full-text search:** `tsvector @@ plainto_tsquery` (PostgreSQL `simple` config — multilingual)
3. **Fusion:** `1/(60+rank_vector) + 1/(60+rank_text)` — combines both signals

All retrieval is **scope-filtered** (stream + semester + section + subject).

### Key Tables

| Table | Purpose |
|---|---|
| `document_chunks` | Text chunks + `embedding_local` vectors |
| `documents` | Uploaded files metadata + processing status |
| `ingestion_jobs` | Job queue (pending → running → done/failed) |
| `student_users` | Enrolled students (admin-created) |
| `dashboard_users` | Admin/HOD/faculty accounts |
| `chat_sessions` / `chat_messages` | Conversation history |
| `query_citations` | Tracks which chunks were cited per query |
| `quiz_attempts` / `quiz_questions` | Assessment data |
| `faculty_assignments` | Teaching scope (stream/sem/section/subject) |
| `curriculum_semesters` / `curriculum_subjects` | Academic structure |
| `audit_logs` | Action audit trail |

---

## Authentication & Roles

| Role | Access |
|---|---|
| `admin` | Full access — all streams, all users, all analytics |
| `hod` | Their stream — students, documents, analytics, faculty performance |
| `faculty` | Documents they uploaded + analytics on their materials |
| `student` | Chunks matching their stream + semester + section |

- Students cannot self-register (admin-enrolled via CSV)
- Google OAuth login for students (must be pre-enrolled)
- JWT stored in `httpOnly` cookies
- Scoping enforced server-side in every route

---

## Local Development

### Start everything:
```bash
./dev-local.sh
```

This:
1. Starts the embedding service on `:8100` (waits for `/health == ready`)
2. Starts Next.js on `:3000`
3. Starts the ingestion worker

### Start individually:
```bash
# 1. Embedding service
source optimized-worker/.venv/bin/activate
cd embedding-service && uvicorn app.main:app --host 127.0.0.1 --port 8100

# 2. Next.js
npm run dev

# 3. Ingestion worker
source optimized-worker/.venv/bin/activate
python -m worker.main
```

### Database setup:
```bash
npm run db:setup    # init schema + seed admin + validate
```

---

## Data Flow

### Query Flow
```
Student types question
  → POST /api/v1/query/stream
  → embeddingRouter.ts → localEmbeddings.ts → HTTP POST http://127.0.0.1:8100/embed
  → 384-dim vector returned (~7ms total)
  → Hybrid SQL: pgvector cosine + tsvector RRF, scope-filtered
  → Top-K chunks retrieved
  → Gemini streaming with context + [[#n]] citation ordinals
  → SSE response to client
  → Chat message + citations persisted
```

### Ingestion Flow
```
Faculty uploads document
  → POST /api/v1/ingest
  → File → R2/Dropbox, document row created (status=processing), job enqueued
  → 202 response (instant)

Worker picks up job (polling):
  → Download file
  → PyMuPDF extraction (+ OCR for image-only pages)
  → Paragraph-aware chunking
  → HTTP POST http://127.0.0.1:8100/embed/batch
  → 384-dim vectors for each chunk
  → INSERT INTO document_chunks (with embedding_local)
  → Document status → ready
```
