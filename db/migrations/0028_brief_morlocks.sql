CREATE TYPE "public"."review_type" AS ENUM('cloze_manual', 'cloze_flashcard', 'flashcard');--> statement-breakpoint
CREATE TABLE "user_review_preferences" (
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"grammar_review_type" "review_type" DEFAULT 'cloze_manual' NOT NULL,
	"vocabulary_review_type" "review_type" DEFAULT 'cloze_manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_review_preferences_user_id_language_id_pk" PRIMARY KEY("user_id","language_id")
);
--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD CONSTRAINT "user_review_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD CONSTRAINT "user_review_preferences_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;