# Siksha Saathi

Siksha Saathi is an AI-powered academic tutoring and learning platform designed for higher education institutions. The system provides curriculum-aligned Socratic tutoring, automated assessment generation, study material distribution, and institutional analytics.

---

## Core Features

### Student Portal
- **Socratic AI Tutor**: Streaming, low-latency conversational assistant powered by Google Gemini, trained to guide students through conceptual reasoning rather than providing direct answers.
- **Curriculum-Scoped Retrieval**: Retrieval-Augmented Generation (RAG) strictly partitioned by student department (stream), semester, and subject.
- **Study Materials Repository**: Access course documents, lecture notes, and syllabus materials with in-browser previews and direct downloads.
- **Adaptive Quiz Generation**: Automated multiple-choice question (MCQ) generation derived directly from course documents, complete with real-time evaluation and detailed explanations.
- **Student Authentication**: Secure session management supporting email/password and Google OAuth 2.0 integration.

### Faculty and Admin Dashboard
- **Document Ingestion Pipeline**: Ingest course materials across PDF, DOCX, TXT, and scanned image formats (with OCR fallback), automatically chunked and indexed into vector embeddings.
- **Curriculum Management**: Configure streams, semesters, subjects, and modules dynamically.
- **Student Enrollment**: Batch student onboarding via CSV upload with automatic credential generation and profile initialization.
- **Analytics & Telemetry**: Monitor student query patterns, subject-level engagement, and document utilization metrics.
- **Audit Logging**: Comprehensive activity tracking for all administrative, ingestion, and configuration operations.

---

## Architecture and Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript |
| **Database** | PostgreSQL (NeonDB) with `pgvector` extension |
| **LLM & Embeddings** | Google Gemini (`gemini-3.1-flash-lite`, `gemini-embedding-001`) |
| **File Storage** | Cloudflare R2 (S3-compatible, zero-egress) / Dropbox API |
| **Authentication** | JWT (`jose`), `bcryptjs`, Google Identity Services OAuth 2.0 |
| **Styling** | Vanilla CSS with custom design tokens |

---

## Project Structure

```
siksha-saathi/
├── src/
│   ├── app/
│   │   ├── (auth)/             # Student login and registration
│   │   ├── (student)/          # Chat, resources, and examination pages
│   │   ├── admin/              # Institutional management portal
│   │   └── api/v1/             # Full REST API and streaming endpoints
│   ├── components/
│   │   ├── admin/              # Admin interface components
│   │   └── student/            # Student portal components (Chat, Layout, Preview)
│   ├── context/                # React state providers (Auth, Chat, Toast)
│   ├── lib/
│   │   ├── client/             # Frontend API client and utilities
│   │   └── server/             # Database, LLM, Embeddings, Storage, and Auth services
│   └── types/                  # Shared TypeScript interfaces
├── scripts/                    # Maintenance and token utilities
├── .env.example                # Environment variable template
├── next.config.mjs             # Next.js configuration
├── package.json
└── tsconfig.json
```

---

## Environment Configuration

Create a `.env.local` file in the project root based on `.env.example`:

```env
# Database
DATABASE_URL=postgresql://user:password@host/database?sslmode=verify-full

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIM=768
CHUNK_SIZE=500
CHUNK_OVERLAP=50
RETRIEVAL_TOP_K=5

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

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

### 2. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### 3. Production Build

```bash
npm run build
npm run start
```

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/query/stream` | Socratic RAG chat stream (SSE) |
| `POST` | `/api/v1/quiz/generate` | Generate structured MCQs from course content |
| `GET` | `/api/v1/documents` | List course materials scoped to student stream/semester |
| `POST` | `/api/v1/ingest` | Process, chunk, and index course documents |
| `GET` | `/api/v1/filters` | Retrieve dynamic stream, semester, and subject metadata |
| `POST` | `/api/v1/auth/google` | Google OAuth token verification and session initiation |
| `GET` | `/api/v1/analytics/overview` | Institutional query and engagement statistics |
