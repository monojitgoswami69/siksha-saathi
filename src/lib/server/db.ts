/**
 * NeonDB PostgreSQL Client & Connection Pooling
 * Supports relational queries and pgvector vector search operations.
 */

import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn('⚠️ DATABASE_URL not set in environment variables');
    }

    const isLocal = connectionString?.includes('localhost') || connectionString?.includes('127.0.0.1');
    const config: PoolConfig = {
      connectionString: connectionString || '',
      ...(isLocal ? { ssl: false } : {}),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
  const db = getDbPool();
  try {
    const res = await db.query(text, params);
    return { rows: res.rows as T[], rowCount: res.rowCount };
  } catch (err: any) {
    // If the error is undefined table/extension, we can try initializing the schema
    console.error(`PostgreSQL Query Error [${text.slice(0, 80)}...]:`, err.message);
    throw err;
  }
}

let schemaInitialized = false;
let initSchemaPromise: Promise<void> | null = null;

/**
 * Initializes the NeonDB PostgreSQL Schema and pgvector extension (runs only ONCE)
 */
export async function initDbSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (initSchemaPromise) return initSchemaPromise;

  initSchemaPromise = (async () => {
    const db = getDbPool();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

    // 1. Enable extensions
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    } catch (e: any) {
      console.warn('pgvector extension warning (might need superuser or already enabled):', e.message);
    }

    // 2. Dashboard Users (Admin, HOD, Faculty)
    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'faculty',
        display_name VARCHAR(255),
        stream VARCHAR(100),
        department VARCHAR(100),
        organization_name VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 3. Student Users (Auth + Profile)
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
        batch VARCHAR(50),
        avatar_url VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 4. Documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        source VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size_bytes BIGINT DEFAULT 0,
        storage_provider VARCHAR(50) DEFAULT 'r2',
        file_key VARCHAR(500),
        preview_url VARCHAR(1000),
        dropbox_path VARCHAR(500),
        dropbox_shared_link VARCHAR(500),
        stream VARCHAR(100),
        semester VARCHAR(20),
        subject VARCHAR(200),
        module VARCHAR(200),
        uploaded_by UUID,
        uploader_email VARCHAR(255),
        total_chunks INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(50) DEFAULT 'r2';
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_key VARCHAR(500);
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS preview_url VARCHAR(1000);
    `);

    // 5. Document Chunks (768-dimension for Gemini text-embedding-004)
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INT NOT NULL,
        total_chunks INT NOT NULL,
        raw_content TEXT NOT NULL,
        page_start INT,
        page_end INT,
        source VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        stream VARCHAR(100),
        semester VARCHAR(20),
        subject VARCHAR(200),
        module VARCHAR(200),
        embedding vector(768),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 6. Indexes for vector search & metadata
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON document_chunks (stream, semester, subject);
      CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks (document_id);
    `);

    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON document_chunks 
        USING hnsw (embedding vector_cosine_ops);
      `);
    } catch (e: any) {
      console.warn('HNSW index creation note:', e.message);
    }

    // 7. Chat Sessions & Messages
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

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at ASC);
    `);

    // 8. Quiz Results
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

      CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results (user_id, submitted_at DESC);
    `);

    // 9. Curriculum Structure
    await client.query(`
      CREATE TABLE IF NOT EXISTS curriculum (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        stream VARCHAR(100) NOT NULL,
        semester VARCHAR(20) NOT NULL,
        subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_by UUID,
        UNIQUE(stream, semester)
      );
    `);

    // 10. Analytics & Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS query_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES student_users(id) ON DELETE SET NULL,
        query_text TEXT NOT NULL,
        subject VARCHAR(200),
        stream VARCHAR(100),
        semester VARCHAR(20),
        top_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_query_logs_analytics ON query_logs (stream, semester, subject, created_at);

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

      CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs (created_at DESC);
    `);

    // 11. Seed initial admin user if empty
    const adminCheck = await client.query('SELECT id FROM dashboard_users LIMIT 1;');
    if (adminCheck.rowCount === 0) {
      // Default admin: admin@sikshasaathi.edu / admin123
      const defaultHash = '$2a$10$Y1c7N9Z2V2XQ9fL9f8Ie6uI2bQvDq1O9F0aA3rD.qZzUeN5W0k8rC'; // bcrypt for admin123
      await client.query(`
        INSERT INTO dashboard_users (email, password_hash, role, display_name, organization_name)
        VALUES ('admin@sikshasaathi.edu', $1, 'admin', 'Siksha Saathi Administrator', 'Siksha Saathi College')
        ON CONFLICT (email) DO NOTHING;
      `, [defaultHash]);
    }

    await client.query('COMMIT');
    schemaInitialized = true;
    console.log('✅ Database schema and tables verified');
  } catch (err) {
    await client.query('ROLLBACK');
    schemaInitialized = false;
    initSchemaPromise = null;
    console.error('❌ Failed to initialize database schema:', err);
    throw err;
  } finally {
    client.release();
  }
  })();

  return initSchemaPromise;
}
