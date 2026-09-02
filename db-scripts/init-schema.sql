-- Siksha Saathi Database Schema Initialization
-- Automatically provisioned on initial container startup by pgvector/pgvector:pg16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Dashboard Users (Admin, HOD, Faculty)
CREATE TABLE IF NOT EXISTS dashboard_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  google_id VARCHAR(255) UNIQUE,
  role VARCHAR(50) NOT NULL DEFAULT 'faculty',
  display_name VARCHAR(255),
  avatar_url VARCHAR(500),
  stream VARCHAR(100),
  department VARCHAR(100),
  organization_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hod_streams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES dashboard_users(id) ON DELETE CASCADE,
  stream VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, stream)
);
CREATE INDEX IF NOT EXISTS idx_hod_streams_user ON hod_streams (user_id);

CREATE TABLE IF NOT EXISTS faculty_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES dashboard_users(id) ON DELETE CASCADE,
  stream VARCHAR(100) NOT NULL,
  semester VARCHAR(20) NOT NULL,
  section VARCHAR(50) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, stream, semester, section, subject)
);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_user ON faculty_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_faculty_assignments_scope ON faculty_assignments (stream, semester, section, subject);

-- 2. Student Users
CREATE TABLE IF NOT EXISTS student_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id VARCHAR(255) UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  roll VARCHAR(100),
  stream VARCHAR(100) NOT NULL DEFAULT 'cse',
  sem VARCHAR(20) NOT NULL DEFAULT '1',
  section VARCHAR(50),
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  file_size_bytes BIGINT DEFAULT 0,
  storage_provider VARCHAR(50) DEFAULT 'local',
  file_key VARCHAR(500),
  preview_url VARCHAR(1000),
  stream VARCHAR(100),
  semester VARCHAR(20),
  section VARCHAR(50),
  subject VARCHAR(200),
  module VARCHAR(200),
  uploaded_by UUID,
  uploader_email VARCHAR(255),
  total_chunks INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'ready',
  processing_progress INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Document Chunks (Vector Store)
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  total_chunks INT NOT NULL,
  raw_content TEXT NOT NULL,
  page_start INT,
  page_end INT,
  paragraph_id VARCHAR(100),
  chunk_type VARCHAR(30) DEFAULT 'text',
  char_start INT,
  char_end INT,
  file_name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  stream VARCHAR(100),
  semester VARCHAR(20),
  section VARCHAR(50),
  subject VARCHAR(200),
  module VARCHAR(200),
  embedding vector(768),
  embedding_local vector(384),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', raw_content)) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Chat Sessions & Messages
CREATE TABLE IF NOT EXISTS chat_sessions (
  id VARCHAR(100) PRIMARY KEY,
  user_id UUID REFERENCES student_users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(100) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Quiz Results
CREATE TABLE IF NOT EXISTS quiz_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES student_users(id) ON DELETE CASCADE,
  subject VARCHAR(200) NOT NULL,
  module VARCHAR(200),
  score INT NOT NULL,
  total_questions INT NOT NULL,
  percentage INT NOT NULL,
  time_taken_seconds INT DEFAULT 0,
  questions JSONB NOT NULL,
  answers JSONB NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Curriculum
CREATE TABLE IF NOT EXISTS curriculum (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream VARCHAR(100) NOT NULL,
  semester VARCHAR(20) NOT NULL,
  subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID,
  UNIQUE(stream, semester)
);

-- 8. Ingestion Queue
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  locked_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs (status, created_at);

-- 9. Analytics & Audit Logs
CREATE TABLE IF NOT EXISTS query_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES student_users(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  subject VARCHAR(200),
  stream VARCHAR(100),
  semester VARCHAR(20),
  section VARCHAR(50),
  top_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_log_id UUID REFERENCES query_logs(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  document_id UUID,
  subject VARCHAR(200),
  stream VARCHAR(100),
  semester VARCHAR(20),
  section VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  user_email VARCHAR(255),
  role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(100),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON document_chunks (stream, semester, section, subject);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_analytics ON query_logs (stream, semester, section, subject, created_at);
CREATE INDEX IF NOT EXISTS idx_query_citations_subject ON query_citations (subject, created_at);
CREATE INDEX IF NOT EXISTS idx_query_citations_doc ON query_citations (document_id);
CREATE INDEX IF NOT EXISTS idx_query_citations_scope ON query_citations (stream, semester, section, subject);
CREATE INDEX IF NOT EXISTS idx_query_citations_query ON query_citations (query_log_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_local ON document_chunks 
USING hnsw (embedding_local vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chunks_search_vector ON document_chunks
USING gin (search_vector);

-- Default Admin User (admin@sikshasaathi.in / admin123)
-- SHA-256 for admin123 is 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT INTO dashboard_users (email, password_hash, role, display_name, department)
VALUES (
  'admin@sikshasaathi.in',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'admin',
  'System Administrator',
  'Administration'
) ON CONFLICT (email) DO NOTHING;
