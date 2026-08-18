import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

/**
 * 1. Dashboard Users (Admin, HOD, Faculty, Assistant)
 */
export const dashboardUsers = pgTable('dashboard_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('faculty'),
  displayName: varchar('display_name', { length: 255 }),
  stream: varchar('stream', { length: 100 }),
  department: varchar('department', { length: 100 }),
  organizationName: varchar('organization_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * 2. Student Users (Auth + Academic Profile)
 */
export const studentUsers = pgTable('student_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  googleId: varchar('google_id', { length: 255 }).unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  roll: varchar('roll', { length: 100 }),
  stream: varchar('stream', { length: 100 }).notNull().default('cse'),
  sem: varchar('sem', { length: 20 }).notNull().default('1'),
  section: varchar('section', { length: 50 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * 3. Documents Repository
 */
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).default(0),
  storageProvider: varchar('storage_provider', { length: 50 }).default('r2'),
  fileKey: varchar('file_key', { length: 500 }),
  previewUrl: varchar('preview_url', { length: 1000 }),
  dropboxPath: varchar('dropbox_path', { length: 500 }),
  dropboxSharedLink: varchar('dropbox_shared_link', { length: 500 }),
  stream: varchar('stream', { length: 100 }),
  semester: varchar('semester', { length: 20 }),
  section: varchar('section', { length: 50 }),
  subject: varchar('subject', { length: 200 }),
  module: varchar('module', { length: 200 }),
  uploadedBy: uuid('uploaded_by'),
  uploaderEmail: varchar('uploader_email', { length: 255 }),
  totalChunks: integer('total_chunks').default(0),
  status: varchar('status', { length: 50 }).default('ready'),
  errorMessage: text('error_message'),
  processingProgress: integer('processing_progress').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * 4. Document Chunks (pgvector Vector Store + Full-Text Search)
 */
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    chunkIndex: integer('chunk_index').notNull(),
    totalChunks: integer('total_chunks').notNull(),
    rawContent: text('raw_content').notNull(),
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),
    paragraphId: varchar('paragraph_id', { length: 100 }),
    chunkType: varchar('chunk_type', { length: 30 }).default('text'),
    charStart: integer('char_start'),
    charEnd: integer('char_end'),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }),
    stream: varchar('stream', { length: 100 }),
    semester: varchar('semester', { length: 20 }),
    section: varchar('section', { length: 50 }),
    subject: varchar('subject', { length: 200 }),
    module: varchar('module', { length: 200 }),
    embedding: vector('embedding', { dimensions: 768 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_chunks_metadata').on(table.stream, table.semester, table.section, table.subject),
    index('idx_chunks_doc_id').on(table.documentId, table.chunkIndex),
    index('idx_chunks_embedding').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('idx_chunks_fts').using('gin', sql`to_tsvector('simple', ${table.rawContent})`),
  ]
);

/**
 * 5. Chat Sessions
 */
export const chatSessions = pgTable('chat_sessions', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: uuid('user_id')
    .references(() => studentUsers.id, { onDelete: 'cascade' })
    .notNull(),
  title: varchar('title', { length: 255 }).notNull().default('New Chat'),
  isPinned: boolean('is_pinned').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * 6. Chat Messages
 */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: varchar('session_id', { length: 100 })
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    sources: jsonb('sources'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_chat_messages_session').on(table.sessionId, table.createdAt.asc()),
  ]
);

/**
 * 7. Quiz Results
 */
export const quizResults = pgTable(
  'quiz_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => studentUsers.id, { onDelete: 'cascade' })
      .notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    module: varchar('module', { length: 200 }),
    score: integer('score').notNull(),
    totalQuestions: integer('total_questions').notNull(),
    percentage: integer('percentage').notNull(),
    timeTakenSeconds: integer('time_taken_seconds').default(0),
    questions: jsonb('questions').notNull(),
    answers: jsonb('answers').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_quiz_results_user').on(table.userId, table.submittedAt.desc()),
  ]
);

/**
 * 8. Curriculum Structure
 */
export const curriculum = pgTable(
  'curriculum',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    stream: varchar('stream', { length: 100 }).notNull(),
    semester: varchar('semester', { length: 20 }).notNull(),
    subjects: jsonb('subjects').notNull().default('[]'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    updatedBy: uuid('updated_by'),
  },
  (table) => [
    unique('curriculum_stream_semester_key').on(table.stream, table.semester),
  ]
);

/**
 * 9. Query Telemetry Logs
 */
export const queryLogs = pgTable(
  'query_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => studentUsers.id, { onDelete: 'set null' }),
    queryText: text('query_text').notNull(),
    subject: varchar('subject', { length: 200 }),
    stream: varchar('stream', { length: 100 }),
    semester: varchar('semester', { length: 20 }),
    section: varchar('section', { length: 50 }),
    topChunkId: uuid('top_chunk_id').references(() => documentChunks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_query_logs_analytics').on(table.stream, table.semester, table.section, table.subject, table.createdAt),
  ]
);

/**
 * 9b. Query Citations — one row per chunk the LLM actually cited in a query.
 * Powers per-material / per-subject heatmap counters (a query sourcing N
 * materials increments all N, not just the top chunk).
 */
export const queryCitations = pgTable(
  'query_citations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    queryLogId: uuid('query_log_id')
      .references(() => queryLogs.id, { onDelete: 'cascade' })
      .notNull(),
    chunkId: uuid('chunk_id').references(() => documentChunks.id, { onDelete: 'set null' }),
    documentId: uuid('document_id'),
    subject: varchar('subject', { length: 200 }),
    stream: varchar('stream', { length: 100 }),
    semester: varchar('semester', { length: 20 }),
    section: varchar('section', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_query_citations_subject').on(table.subject, table.createdAt),
    index('idx_query_citations_doc').on(table.documentId),
    index('idx_query_citations_scope').on(table.stream, table.semester, table.section, table.subject),
    index('idx_query_citations_query').on(table.queryLogId),
  ]
);

/**
 * 10. Audit Logs
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id'),
    userEmail: varchar('user_email', { length: 255 }),
    role: varchar('role', { length: 50 }),
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 100 }),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_audit_logs_time').on(table.createdAt.desc()),
  ]
);

/**
 * Relations Definitions
 */
export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export const studentUsersRelations = relations(studentUsers, ({ many }) => ({
  chatSessions: many(chatSessions),
  quizResults: many(quizResults),
  queryLogs: many(queryLogs),
}));

export const queryLogsRelations = relations(queryLogs, ({ one, many }) => ({
  student: one(studentUsers, {
    fields: [queryLogs.userId],
    references: [studentUsers.id],
  }),
  topChunk: one(documentChunks, {
    fields: [queryLogs.topChunkId],
    references: [documentChunks.id],
  }),
  citations: many(queryCitations),
}));

export const queryCitationsRelations = relations(queryCitations, ({ one }) => ({
  queryLog: one(queryLogs, {
    fields: [queryCitations.queryLogId],
    references: [queryLogs.id],
  }),
  chunk: one(documentChunks, {
    fields: [queryCitations.chunkId],
    references: [documentChunks.id],
  }),
}));

/**
 * 9c. Ingestion Jobs — DB-backed job queue consumed by the long-running
 * ingestion worker (deployed separately, e.g. on Render). The Next.js app
 * enqueues; the worker claims via FOR UPDATE SKIP LOCKED and processes.
 */
export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_ingestion_jobs_status').on(table.status, table.createdAt),
  ]
);

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  student: one(studentUsers, {
    fields: [chatSessions.userId],
    references: [studentUsers.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));
