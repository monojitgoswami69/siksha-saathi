CREATE TABLE "quizzes" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" varchar(200) NOT NULL,
	"num_questions" integer NOT NULL,
	"document_id" uuid,
	"file_name" varchar(255),
	"questions" jsonb NOT NULL,
	"selected_answers" jsonb DEFAULT '{}' NOT NULL,
	"review_answers" jsonb DEFAULT '{}' NOT NULL,
	"status" varchar(50) DEFAULT 'available' NOT NULL,
	"score" integer,
	"percentage" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_user_id_student_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."student_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quizzes_user_status" ON "quizzes" USING btree ("user_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "dropbox_path";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "dropbox_shared_link";