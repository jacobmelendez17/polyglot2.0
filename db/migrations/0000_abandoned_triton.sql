CREATE TYPE "public"."curriculum_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."learning_item_type" AS ENUM('vocabulary', 'grammar');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('in_progress', 'succeeded');--> statement-breakpoint
CREATE TYPE "public"."synonym_side" AS ENUM('term', 'meaning');--> statement-breakpoint
CREATE TYPE "public"."srs_stage" AS ENUM('beginner_1', 'beginner_2', 'beginner_3', 'beginner_4', 'familiar_1', 'familiar_2', 'intermediate', 'master', 'fluent');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin', 'beta-tester', 'developer');--> statement-breakpoint
CREATE TABLE "grammar_items" (
	"learning_item_id" uuid PRIMARY KEY NOT NULL,
	"title" text,
	"structure" text NOT NULL,
	"primary_meaning" text NOT NULL,
	"explanation" text NOT NULL,
	"category" text,
	"creator_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_item_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"sentence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_item_sentences_item_position_key" UNIQUE("learning_item_id","position")
);
--> statement-breakpoint
CREATE TABLE "learning_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"type" "learning_item_type" NOT NULL,
	"status" "curriculum_status" DEFAULT 'draft' NOT NULL,
	"position" integer NOT NULL,
	"lesson_priority" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_items_id_language_id_key" UNIQUE("id","language_id"),
	CONSTRAINT "learning_items_level_type_position_key" UNIQUE("level_id","type","position")
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"level_number" integer NOT NULL,
	"name" text,
	"status" "curriculum_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_language_id_level_number_key" UNIQUE("language_id","level_number"),
	CONSTRAINT "levels_id_language_id_key" UNIQUE("id","language_id")
);
--> statement-breakpoint
CREATE TABLE "sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"target_text" text NOT NULL,
	"translation" text NOT NULL,
	"status" "curriculum_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"status" "curriculum_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_groups_level_id_position_key" UNIQUE("level_id","position"),
	CONSTRAINT "vocabulary_groups_id_language_id_key" UNIQUE("id","language_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_items" (
	"learning_item_id" uuid PRIMARY KEY NOT NULL,
	"vocabulary_group_id" uuid NOT NULL,
	"term" text NOT NULL,
	"primary_meaning" text NOT NULL,
	"definition" text,
	"article" text,
	"part_of_speech" text NOT NULL,
	"pronunciation" text,
	"ipa" text,
	"context" text,
	"creator_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'in_progress' NOT NULL,
	"response_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_user_operation_key_key" UNIQUE("user_id","operation","key")
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "languages_code_unique" UNIQUE("code"),
	CONSTRAINT "languages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notes_user_learning_item_key" UNIQUE("user_id","learning_item_id")
);
--> statement-breakpoint
CREATE TABLE "user_synonyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"side" "synonym_side" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_synonyms_user_item_side_normalized_key" UNIQUE("user_id","learning_item_id","side","normalized_value")
);
--> statement-breakpoint
CREATE TABLE "user_item_progress" (
	"user_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"srs_stage" "srs_stage" NOT NULL,
	"learned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_review_at" timestamp with time zone,
	"fluent_at" timestamp with time zone,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"incorrect_count" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_item_progress_user_id_learning_item_id_pk" PRIMARY KEY("user_id","learning_item_id")
);
--> statement-breakpoint
CREATE TABLE "user_level_progress" (
	"user_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"unlocked_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_level_progress_user_id_level_id_pk" PRIMARY KEY("user_id","level_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"display_name" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"active_language_id" uuid NOT NULL,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"sandbox_owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_sandbox_owner_consistency" CHECK (("users"."is_sandbox" = true AND "users"."sandbox_owner_user_id" IS NOT NULL) OR ("users"."is_sandbox" = false AND "users"."sandbox_owner_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "grammar_items" ADD CONSTRAINT "grammar_items_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_item_sentences" ADD CONSTRAINT "learning_item_sentences_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_item_sentences" ADD CONSTRAINT "learning_item_sentences_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_level_language_fk" FOREIGN KEY ("level_id","language_id") REFERENCES "public"."levels"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_groups" ADD CONSTRAINT "vocabulary_groups_level_language_fk" FOREIGN KEY ("level_id","language_id") REFERENCES "public"."levels"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_vocabulary_group_id_vocabulary_groups_id_fk" FOREIGN KEY ("vocabulary_group_id") REFERENCES "public"."vocabulary_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_synonyms" ADD CONSTRAINT "user_synonyms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_synonyms" ADD CONSTRAINT "user_synonyms_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_progress" ADD CONSTRAINT "user_item_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_item_progress" ADD CONSTRAINT "user_item_progress_learning_item_language_fk" FOREIGN KEY ("learning_item_id","language_id") REFERENCES "public"."learning_items"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_level_progress" ADD CONSTRAINT "user_level_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_level_progress" ADD CONSTRAINT "user_level_progress_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_active_language_id_languages_id_fk" FOREIGN KEY ("active_language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_sandbox_owner_user_id_users_id_fk" FOREIGN KEY ("sandbox_owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_item_progress_due_review_idx" ON "user_item_progress" USING btree ("user_id","language_id","next_review_at");--> statement-breakpoint
CREATE INDEX "user_item_progress_learning_item_idx" ON "user_item_progress" USING btree ("learning_item_id","language_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users" USING btree ("clerk_user_id") WHERE "users"."clerk_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_sandbox_owner_user_id_idx" ON "users" USING btree ("sandbox_owner_user_id");