#!/usr/bin/env node

/**
 * Database Schema Initialization Script
 * Creates extensions (uuid-ossp, pgvector), all 10 application tables, and indexes.
 *
 * Usage: npm run db:init
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from .env.local or .env
function loadEnv() {
  const envLocal = path.join(rootDir, '.env.local');
  const envDefault = path.join(rootDir, '.env');
  
  if (typeof process.loadEnvFile === 'function') {
    if (fs.existsSync(envLocal)) {
      process.loadEnvFile(envLocal);
    } else if (fs.existsSync(envDefault)) {
      process.loadEnvFile(envDefault);
    }
  } else {
    const targetFile = fs.existsSync(envLocal) ? envLocal : fs.existsSync(envDefault) ? envDefault : null;
    if (targetFile) {
      const content = fs.readFileSync(targetFile, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...rest] = trimmed.split('=');
          const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
          if (key && !process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      });
    }
  }
}

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ ERROR: DATABASE_URL is not set in environment or .env.local');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({
  connectionString,
  ...(isLocal ? { ssl: false } : {}),
  connectionTimeoutMillis: 10000,
});

async function initSchema() {
  console.log('🚀 Starting Database Schema Initialization...\n');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Extensions
    console.log('📦 Enabling PostgreSQL extensions...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('   ✅ Extension: pgvector enabled');
    } catch (e) {
      console.warn('   ⚠️ Note: pgvector extension could not be created directly (might require elevated permissions or already enabled):', e.message);
    }
    console.log('   ✅ Extension: uuid-ossp enabled');

    // 2. Dashboard Users (Admin, HOD, Faculty)
    console.log('🛠️ Creating tables...');
    await client.query(`
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
      ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
      ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
    `);
    console.log('   ✅ Table: dashboard_users');

    // 2b. HOD stream assignments (a user can be HOD of multiple streams)
    await client.query(`
      CREATE TABLE IF NOT EXISTS hod_streams (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES dashboard_users(id) ON DELETE CASCADE,
        stream VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, stream)
      );
      CREATE INDEX IF NOT EXISTS idx_hod_streams_user ON hod_streams (user_id);
    `);
    console.log('   ✅ Table: hod_streams');

    // 2c. Faculty teaching assignments (arbitrary stream/sem/section/subject combos)
    await client.query(`
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
    `);
    console.log('   ✅ Table: faculty_assignments');

    // 3. Student Users
    await client.query(`
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
      ALTER TABLE student_users ADD COLUMN IF NOT EXISTS section VARCHAR(50);
    `);
    console.log('   ✅ Table: student_users');

    // 4. Documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size_bytes BIGINT DEFAULT 0,
        storage_provider VARCHAR(50) DEFAULT 'r2',
        file_key VARCHAR(500),
        preview_url VARCHAR(1000),
        dropbox_path VARCHAR(500),
        dropbox_shared_link VARCHAR(500),
        stream VARCHAR(100),
        semester VARCHAR(20),
        section VARCHAR(50),
        subject VARCHAR(200),
        module VARCHAR(200),
        uploaded_by UUID,
        uploader_email VARCHAR(255),
        total_chunks INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Rename legacy source -> file_name (idempotent: only if source still exists)
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='source')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='file_name')
        THEN
          ALTER TABLE documents RENAME COLUMN source TO file_name;
        END IF;
      END$$;

      ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(50) DEFAULT 'r2';
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_key VARCHAR(500);
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS preview_url VARCHAR(1000);
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS section VARCHAR(50);
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ready';
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS error_message TEXT;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_progress INT DEFAULT 0;
    `);
    console.log('   ✅ Table: documents');

    // Backfill hod_streams / faculty_assignments from legacy single-stream +
    // uploaded-documents data (one-time, idempotent). Runs after documents exists.
    await client.query(`
      INSERT INTO hod_streams (user_id, stream)
      SELECT id, stream FROM dashboard_users
      WHERE role = 'hod' AND stream IS NOT NULL AND stream != ''
      ON CONFLICT (user_id, stream) DO NOTHING;
    `).catch(() => {}); // ignore if no legacy data
    await client.query(`
      INSERT INTO faculty_assignments (user_id, stream, semester, section, subject)
      SELECT DISTINCT d.uploaded_by, d.stream, d.semester, d.section, d.subject
      FROM documents d
      WHERE d.uploaded_by IS NOT NULL
        AND d.stream IS NOT NULL AND d.stream != 'General'
        AND d.semester IS NOT NULL AND d.semester != 'General'
        AND d.section IS NOT NULL AND d.section != 'General'
        AND d.subject IS NOT NULL AND d.subject != 'General'
      ON CONFLICT (user_id, stream, semester, section, subject) DO NOTHING;
    `).catch(() => {});

    // 5. Document Chunks (Vector Store)
    await client.query(`
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
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Rename legacy source -> file_name on chunks (idempotent)
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='source')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='document_chunks' AND column_name='file_name')
        THEN
          ALTER TABLE document_chunks RENAME COLUMN source TO file_name;
        END IF;
      END$$;

      ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS paragraph_id VARCHAR(100);
      ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS chunk_type VARCHAR(30) DEFAULT 'text';
      ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS char_start INT;
      ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS char_end INT;
      ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS section VARCHAR(50);
    `);
    console.log('   ✅ Table: document_chunks');

    // Drop the unused document_images table if it exists (image OCR text is
    // stored as chunk_type='image' text chunks; no separate image asset table).
    await client.query(`DROP TABLE IF EXISTS document_images CASCADE;`);

    // 6. Chat Sessions & Messages
    await client.query(`
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
    `);
    console.log('   ✅ Table: chat_sessions & chat_messages');

    // 7. Quiz Results
    await client.query(`
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
    `);
    console.log('   ✅ Table: quiz_results');

    // 8. Curriculum
    await client.query(`
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
      ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('   ✅ Table: curriculum');

    // 9. Analytics & Audit Logs
    await client.query(`
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
      ALTER TABLE query_citations ADD COLUMN IF NOT EXISTS document_id UUID;
      ALTER TABLE query_citations ADD COLUMN IF NOT EXISTS section VARCHAR(50);

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
    `);
    console.log('   ✅ Table: query_logs & audit_logs');

    // 10. Indexes
    console.log('⚡ Creating indexes...');
    await client.query(`
      -- Refresh metadata index to include section (drop old, recreate)
      DROP INDEX IF EXISTS idx_chunks_metadata;
      CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON document_chunks (stream, semester, section, subject);
      DROP INDEX IF EXISTS idx_chunks_doc_id;
      CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id, chunk_index);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results (user_id, submitted_at DESC);
      DROP INDEX IF EXISTS idx_query_logs_analytics;
      CREATE INDEX IF NOT EXISTS idx_query_logs_analytics ON query_logs (stream, semester, section, subject, created_at);
      CREATE INDEX IF NOT EXISTS idx_query_citations_subject ON query_citations (subject, created_at);
      CREATE INDEX IF NOT EXISTS idx_query_citations_doc ON query_citations (document_id);
      CREATE INDEX IF NOT EXISTS idx_query_citations_scope ON query_citations (stream, semester, section, subject);
      CREATE INDEX IF NOT EXISTS idx_query_citations_query ON query_citations (query_log_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs (created_at DESC);
    `);

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks 
        USING hnsw (embedding vector_cosine_ops);
      `);
      console.log('   ✅ HNSW Vector Index: idx_chunks_embedding');
    } catch (e) {
      console.warn('   ⚠️ HNSW index creation note (requires pgvector):', e.message);
    }

    try {
      // Use 'simple' config for language-agnostic (multilingual) tokenization
      // so non-English content is also full-text searchable.
      await client.query(`DROP INDEX IF EXISTS idx_chunks_fts;`);
      await client.query(`
        CREATE INDEX idx_chunks_fts ON document_chunks
        USING gin (to_tsvector('simple', raw_content));
      `);
      console.log('   ✅ Full-Text GIN Search Index: idx_chunks_fts (simple/multilingual)');
    } catch (e) {
      console.warn('   ⚠️ GIN FTS index creation note:', e.message);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Schema initialization completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Schema initialization failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initSchema();
