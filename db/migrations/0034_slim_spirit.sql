CREATE TYPE "public"."ghost_stage" AS ENUM('ghost_1', 'ghost_2', 'ghost_3', 'ghost_4');--> statement-breakpoint
CREATE TYPE "public"."ghost_mode" AS ENUM('on', 'minimal', 'off');--> statement-breakpoint
CREATE TABLE "user_sentence_ghost_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"sentence_id" uuid NOT NULL,
	"content_type" "learning_item_type" NOT NULL,
	"miss_count" integer DEFAULT 0 NOT NULL,
	"ghost_stage" "ghost_stage",
	"next_review_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sentence_ghost_progress_identity_key" UNIQUE("user_id","learning_item_id","sentence_id")
);
--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "grammar_ghost_mode" "ghost_mode" DEFAULT 'on' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "vocabulary_ghost_mode" "ghost_mode" DEFAULT 'on' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sentence_ghost_progress" ADD CONSTRAINT "user_sentence_ghost_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sentence_ghost_progress" ADD CONSTRAINT "user_sentence_ghost_progress_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sentence_ghost_progress" ADD CONSTRAINT "user_sentence_ghost_progress_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sentence_ghost_progress" ADD CONSTRAINT "user_sentence_ghost_progress_learning_item_language_fk" FOREIGN KEY ("learning_item_id","language_id") REFERENCES "public"."learning_items"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sentence_ghost_progress_due_review_idx" ON "user_sentence_ghost_progress" USING btree ("user_id","language_id","next_review_at");