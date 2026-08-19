CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_email" varchar(255),
	"role" varchar(50),
	"action" varchar(100) NOT NULL,
	"target_type" varchar(100),
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(100) NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) DEFAULT 'New Chat' NOT NULL,
	"is_pinned" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "curriculum" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream" varchar(100) NOT NULL,
	"semester" varchar(20) NOT NULL,
	"subjects" jsonb DEFAULT '[]' NOT NULL,
	"sections" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid,
	CONSTRAINT "curriculum_stream_semester_key" UNIQUE("stream","semester")
);
--> statement-breakpoint
CREATE TABLE "dashboard_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"google_id" varchar(255),
	"role" varchar(50) DEFAULT 'faculty' NOT NULL,
	"display_name" varchar(255),
	"avatar_url" varchar(500),
	"stream" varchar(100),
	"department" varchar(100),
	"organization_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "dashboard_users_email_unique" UNIQUE("email"),
	CONSTRAINT "dashboard_users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"total_chunks" integer NOT NULL,
	"raw_content" text NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"paragraph_id" varchar(100),
	"chunk_type" varchar(30) DEFAULT 'text',
	"char_start" integer,
	"char_end" integer,
	"file_name" varchar(255) NOT NULL,
	"title" varchar(255),
	"stream" varchar(100),
	"semester" varchar(20),
	"section" varchar(50),
	"subject" varchar(200),
	"module" varchar(200),
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"file_size_bytes" bigint DEFAULT 0,
	"storage_provider" varchar(50) DEFAULT 'r2',
	"file_key" varchar(500),
	"preview_url" varchar(1000),
	"dropbox_path" varchar(500),
	"dropbox_shared_link" varchar(500),
	"stream" varchar(100),
	"semester" varchar(20),
	"section" varchar(50),
	"subject" varchar(200),
	"module" varchar(200),
	"uploaded_by" uuid,
	"uploader_email" varchar(255),
	"total_chunks" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'ready',
	"error_message" text,
	"processing_progress" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "faculty_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stream" varchar(100) NOT NULL,
	"semester" varchar(20) NOT NULL,
	"section" varchar(50) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "faculty_assignments_user_scope_key" UNIQUE("user_id","stream","semester","section","subject")
);
--> statement-breakpoint
CREATE TABLE "hod_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stream" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "hod_streams_user_stream_key" UNIQUE("user_id","stream")
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "query_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_log_id" uuid NOT NULL,
	"chunk_id" uuid,
	"document_id" uuid,
	"subject" varchar(200),
	"stream" varchar(100),
	"semester" varchar(20),
	"section" varchar(50),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "query_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"query_text" text NOT NULL,
	"subject" varchar(200),
	"stream" varchar(100),
	"semester" varchar(20),
	"section" varchar(50),
	"top_chunk_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" varchar(200) NOT NULL,
	"module" varchar(200),
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"percentage" integer NOT NULL,
	"time_taken_seconds" integer DEFAULT 0,
	"questions" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"google_id" varchar(255),
	"display_name" varchar(255) NOT NULL,
	"name" varchar(255),
	"roll" varchar(100),
	"stream" varchar(100) DEFAULT 'cse' NOT NULL,
	"sem" varchar(20) DEFAULT '1' NOT NULL,
	"section" varchar(50),
	"avatar_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "student_users_email_unique" UNIQUE("email"),
	CONSTRAINT "student_users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_student_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."student_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faculty_assignments" ADD CONSTRAINT "faculty_assignments_user_id_dashboard_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dashboard_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hod_streams" ADD CONSTRAINT "hod_streams_user_id_dashboard_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."dashboard_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_citations" ADD CONSTRAINT "query_citations_query_log_id_query_logs_id_fk" FOREIGN KEY ("query_log_id") REFERENCES "public"."query_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_citations" ADD CONSTRAINT "query_citations_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_user_id_student_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."student_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_top_chunk_id_document_chunks_id_fk" FOREIGN KEY ("top_chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_results" ADD CONSTRAINT "quiz_results_user_id_student_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."student_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_time" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chunks_metadata" ON "document_chunks" USING btree ("stream","semester","section","subject");--> statement-breakpoint
CREATE INDEX "idx_chunks_doc_id" ON "document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_chunks_embedding" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_chunks_fts" ON "document_chunks" USING gin (to_tsvector('simple', "raw_content"));--> statement-breakpoint
CREATE INDEX "idx_faculty_assignments_user" ON "faculty_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_faculty_assignments_scope" ON "faculty_assignments" USING btree ("stream","semester","section","subject");--> statement-breakpoint
CREATE INDEX "idx_hod_streams_user" ON "hod_streams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ingestion_jobs_status" ON "ingestion_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_query_citations_subject" ON "query_citations" USING btree ("subject","created_at");--> statement-breakpoint
CREATE INDEX "idx_query_citations_doc" ON "query_citations" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_query_citations_scope" ON "query_citations" USING btree ("stream","semester","section","subject");--> statement-breakpoint
CREATE INDEX "idx_query_citations_query" ON "query_citations" USING btree ("query_log_id");--> statement-breakpoint
CREATE INDEX "idx_query_logs_analytics" ON "query_logs" USING btree ("stream","semester","section","subject","created_at");--> statement-breakpoint
CREATE INDEX "idx_quiz_results_user" ON "quiz_results" USING btree ("user_id","submitted_at" DESC NULLS LAST);