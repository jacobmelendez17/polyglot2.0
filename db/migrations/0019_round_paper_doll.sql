CREATE TYPE "public"."curriculum_import_row_classification" AS ENUM('create', 'update', 'move', 'unchanged', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."curriculum_import_row_disposition" AS ENUM('skip');--> statement-breakpoint
CREATE TYPE "public"."curriculum_import_status" AS ENUM('uploading', 'queued_for_preview', 'previewing', 'needs_review', 'ready_to_import', 'queued_for_import', 'importing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "curriculum_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"item_type" "learning_item_type",
	"display_term" text,
	"level_number" integer,
	"group_number" integer,
	"classification" "curriculum_import_row_classification" NOT NULL,
	"previous_classification" "curriculum_import_row_classification",
	"resolved_learning_item_id" uuid,
	"changed_fields" jsonb,
	"review_reason_code" text,
	"review_reason" text,
	"admin_disposition" "curriculum_import_row_disposition",
	"changed_since_preview" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_import_rows_import_row_idx" UNIQUE("import_id","row_number")
);
--> statement-breakpoint
CREATE TABLE "curriculum_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"language_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"file_extension" text NOT NULL,
	"s3_bucket" text NOT NULL,
	"s3_key" text NOT NULL,
	"source_sha256" text NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"status" "curriculum_import_status" DEFAULT 'uploading' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"create_count" integer DEFAULT 0 NOT NULL,
	"update_count" integer DEFAULT 0 NOT NULL,
	"move_count" integer DEFAULT 0 NOT NULL,
	"unchanged_count" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"preview_version" integer DEFAULT 0 NOT NULL,
	"confirmed_preview_version" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" text,
	"last_error_summary" text,
	"source_import_id" uuid,
	"uploaded_at" timestamp with time zone,
	"preview_started_at" timestamp with time zone,
	"preview_completed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"import_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"archived_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curriculum_import_rows" ADD CONSTRAINT "curriculum_import_rows_import_id_curriculum_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."curriculum_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_import_rows" ADD CONSTRAINT "curriculum_import_rows_resolved_learning_item_id_learning_items_id_fk" FOREIGN KEY ("resolved_learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_imports" ADD CONSTRAINT "curriculum_imports_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_imports" ADD CONSTRAINT "curriculum_imports_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_imports" ADD CONSTRAINT "curriculum_imports_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curriculum_import_rows_review_idx" ON "curriculum_import_rows" USING btree ("import_id","classification");--> statement-breakpoint
CREATE INDEX "curriculum_imports_history_idx" ON "curriculum_imports" USING btree ("language_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "curriculum_imports"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "curriculum_imports_archived_idx" ON "curriculum_imports" USING btree ("language_id","archived_at" DESC NULLS LAST) WHERE "curriculum_imports"."archived_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "curriculum_imports_status_idx" ON "curriculum_imports" USING btree ("status");