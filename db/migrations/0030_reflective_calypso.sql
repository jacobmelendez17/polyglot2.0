CREATE TYPE "public"."srs_strictness" AS ENUM('one_stage', 'two_stages', 'three_stages', 'half', 'full');--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "grammar_srs_strictness" "srs_strictness" DEFAULT 'one_stage' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "vocabulary_srs_strictness" "srs_strictness" DEFAULT 'one_stage' NOT NULL;