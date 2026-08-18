# Siksha Saathi

Siksha Saathi is an AI-powered academic tutoring, institutional intelligence, and automated examination platform designed for higher education institutions. The system provides curriculum-aligned Socratic tutoring, hybrid vector-and-keyword retrieval, background ingestion pipelines, study material distribution, and institutional analytics.

---

## Core Features

### Student Portal
- **Socratic AI Tutor**: Streaming, low-latency conversational assistant powered by Google Gemini, trained to guide students through conceptual reasoning with probing questions rather than giving immediate answers.
- **Hybrid RAG Retrieval (Vector + Full-Text RRF)**: High-accuracy search combining PostgreSQL `pgvector` cosine similarity with `tsvector` keyword matching via Reciprocal Rank Fusion (RRF).
- **Interactive Page-Level Citations**: Socratic responses cite referenced course notes with clickable source badges that launch in-browser PDF previews directly at the cited page.
- **Study Materials Repository**: Access course documents, lecture notes, and syllabus materials with in-browser previews and direct downloads.
- **Adaptive Quiz Generation**: Automated multiple-choice question (MCQ) generation derived directly from course documents, complete with real-time evaluation and detailed explanations.
- **Student Authentication**: Secure `httpOnly` cookie session management supporting email/password and Google OAuth 2.0 integration.

### Faculty and Admin Dashboard
- **Asynchronous Document Ingestion Pipeline**: High-throughput file processing for PDF, DOCX, TXT, and scanned image formats (with OCR fallback). Uploads respond immediately (`202 Accepted`) while chunking, embedding, and indexing run in the background with live progress tracking (`0% -> 100%`).
- **Curriculum Management**: Configure streams, semesters, subjects, and modules dynamically.
- **Student Enrollment**: Batch student onboarding via CSV upload with automatic credential generation and profile initialization.
- **Analytics & Telemetry**: Monitor student query patterns, subject-level confusion risk, and document utilization metrics.
- **Audit Logging**: Comprehensive activity tracking for all administrative, ingestion, and configuration operations.

---

## Architecture and Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript |
| **Database & ORM** | PostgreSQL (NeonDB) with `pgvector` (HNSW) + Drizzle ORM |
| **Search Engine** | Hybrid Search (pgvector Cosine Distance + Full-Text `tsvector` with Reciprocal Rank Fusion) |
| **LLM & Embeddings** | Google Gemini (`gemini-3.1-flash-lite`, `gemini-embedding-001`) with Exponential Backoff Retries |
| **File Storage** | Cloudflare R2 (S3-compatible, zero-egress) / Dropbox API |
| **Authentication** | `httpOnly` secure cookies, Next.js Proxy (`proxy.ts`), JWT (`jose`), `bcryptjs`, Google OAuth 2.0 |
| **Styling** | Vanilla CSS & TailwindCSS design tokens |

---

## Database Management & CLI Commands

Schema management is handled via **Drizzle ORM** and standalone CLI scripts:

```bash
# Initialize PostgreSQL extensions, tables, and HNSW/GIN indexes
npm run db:init

# Seed administrator credentials and standard engineering curriculum
npm run db:seed

# Run comprehensive diagnostic report on latency, tables, and extensions
npm run db:validate

# Truncate all records across all tables (clean slate)
npm run db:clear

# Drop and re-initialize complete database
npm run db:reset

# Run init + seed + validate sequentially
npm run db:setup

# Generate Drizzle migrations from schema
npm run db:generate

# Push schema changes directly to PostgreSQL
npm run db:push

# Open Drizzle Studio visual web GUI
npm run db:studio
```

---

## Project Structure

```
siksha-saathi/
├── db-scripts/                 # Standalone database management scripts (init, seed, validate, clear, reset)
├── drizzle/                    # Drizzle ORM generated migration artifacts
├── src/
│   ├── app/
│   │   ├── (auth)/             # Student login and registration
│   │   ├── (student)/          # Chat, resources, and examination pages
│   │   ├── admin/              # Institutional management portal (Knowledge base, analytics, curriculum)
│   │   └── api/v1/             # REST API and SSE streaming endpoints
│   ├── components/
│   │   ├── admin/              # Admin interface components (Sidebar, Analytics, Modals)
│   │   └── student/            # Student portal components (Chat, Layout, FilePreview)
│   ├── context/                # React state providers (StudentAuth, AdminAuth, Chat, Toast)
│   ├── db/                     # Drizzle ORM schema definitions and typed client
│   ├── lib/
│   │   ├── client/             # Frontend API client and utilities
│   │   └── server/             # Database pool, LLM, Embeddings, Storage, and Auth services
│   ├── proxy.ts                # Next.js Proxy for zero-flash server-side route protection
│   └── types/                  # Shared TypeScript interfaces
├── architecture.md             # Complete institutional architecture and design document
├── drizzle.config.ts           # Drizzle Kit configuration
├── .env.example                # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Environment Configuration

Create a `.env.local` file in the project root based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=verify-full

# Seeding & Admin Credentials
SEED_ADMIN_EMAIL=admin@sikshasaathi.edu
SEED_ADMIN_PASSWORD=adminpassword
SEED_ADMIN_NAME=Siksha Saathi Administrator

# Gemini AI & RAG Configuration
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIM=768
RAG_SIMILARITY_THRESHOLD=0.25
CHUNK_SIZE=500
CHUNK_OVERLAP=50
RETRIEVAL_TOP_K=5

# Authentication & Security
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Defaults for Student Onboarding
DEFAULT_STUDENT_PASSWORD=student123
DEFAULT_STUDENT_STREAM=cse
DEFAULT_STUDENT_SEM=1
DEFAULT_STUDENT_BATCH=2024-2028

# Storage (Cloudflare R2)
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-custom-domain.com
```

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Database Schema & Seed Data

```bash
npm run db:setup
```

### 3. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/query/stream` | Socratic RAG chat stream (SSE) with Hybrid Search (RRF) and citation tags |
| `POST` | `/api/v1/search` | Direct Hybrid Search querying vector cosine similarity + full-text matches |
| `POST` | `/api/v1/quiz/generate` | Generate structured MCQs from course content |
| `POST` | `/api/v1/quiz/submit` | Evaluate student quiz submission and record telemetry |
| `GET` | `/api/v1/documents` | List course materials scoped to student stream/semester |
| `POST` | `/api/v1/ingest` | Asynchronous file processing (returns 202 Accepted with live background indexing) |
| `GET` | `/api/v1/documents/:id/status` | Real-time status and progress percentage of background document indexing |
| `GET` | `/api/v1/filters` | Fast cached stream, semester, and subject metadata (with 60s TTL) |
| `POST` | `/api/v1/auth/google` | Google OAuth token verification and session initiation |
| `POST` | `/api/v1/auth/logout` | Invalidate and clear session cookies |
| `GET` | `/api/v1/analytics/overview` | Institutional query and engagement statistics |
