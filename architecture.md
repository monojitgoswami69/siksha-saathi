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
| `storage.ts` | Cloudflare R2 (S3-compatible) file storage |
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
| `GET` | `/health` | `{ "status": "starting" \| "ready", "model": ..., "reranker_model": ... }` |
| `POST` | `/embed` | Single text → 384-dim vector (cached for queries) |
| `POST` | `/embed/batch` | Batch texts → list of vectors (for ingestion) |
| `POST` | `/rerank` | Query + candidate passages → Cross-Encoder relevance scores & ranking |
| `GET` | `/metrics` | Cache hits/misses/size, uptime |

**Models Hosted in Service:**
- **Embedding:** `intfloat/multilingual-e5-small` (384-dim, L2-normalized)
  - Query prefix: `"query: <text>"`
  - Passage prefix: `"passage: <text>"`
- **Reranker:** `cross-encoder/ms-marco-MiniLM-L-6-v2` (~80MB, joint sequence classification)
  - Evaluates cross-attention between original query and candidate chunks for precise relevance scoring.

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
  → Download file from Cloudflare R2 / local storage
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
| `storage.py` | Cloudflare R2 download |
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

### Retrieval Strategy — 4-Stage Hybrid RAG Pipeline

Siksha Saathi implements an advanced 4-stage Hybrid RAG retrieval pipeline:

```
User Query
   │
   ├─► Stage 1: Vector Search (Top 25)
   │     • pgvector cosine distance on embedding_local (384-dim E5-small)
   │     • Scoped by stream, semester, section, and subject
   │
   ├─► Stage 2: Keyword / BM25 Search (Top 15)
   │     • PostgreSQL tsvector @@ plainto_tsquery (simple multilingual)
   │     • Scored via ts_rank_cd
   │
   ├─► Stage 3: Reciprocal Rank Fusion (RRF) & Deduplication
   │     • RRF_score = 1/(60 + v_rank) + 1/(60 + t_rank)
   │     • Merges vector + keyword candidates into ~25–35 unique chunks
   │
   └─► Stage 4: Cross-Encoder Reranker
         • POST http://127.0.0.1:8100/rerank
         • Model: cross-encoder/ms-marco-MiniLM-L-6-v2
         • Joint cross-attention on (query, chunk_text)
         • Top 10 highest-ranked chunks selected
               │
               ▼
       Context to Gemini LLM (with [[#1]]..[[#10]] citation tracking)
```

All retrieval strictly enforces academic scoping filters (stream, semester, section, subject) so students never leak or access unauthorized materials.

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

## Local & Cross-Platform Development (Docker Native)

The entire application stack (PostgreSQL with pgvector, FastAPI embedding & reranker microservice, Python ingestion worker, and Next.js web application) runs natively in isolated Docker containers with automated networking, volume persistence, and memory capping.

### Start the full stack:
```bash
docker compose up -d
# or: npm run docker:up
```

This starts all 4 coordinated services:
1. **PostgreSQL** on `:5432` with extensions from `db-scripts/init-extensions.sql` and schema managed via Drizzle ORM (`schema.ts`)
2. **Embedding & Reranker Service** on `:8100` (`multilingual-e5-small` + `ms-marco-MiniLM-L-6-v2`)
3. **Ingestion Worker** (background document extraction, OCR & indexing)
4. **Next.js Web UI** on `:3000` with hot-reload support

### Check status & real-time logs:
```bash
docker compose ps
docker compose logs -f
```

### Clean shutdown (preserves all database data and model cache):
```bash
docker compose down
# or: npm run docker:down
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
  → File → Cloudflare R2, document row created (status=processing), job enqueued
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
