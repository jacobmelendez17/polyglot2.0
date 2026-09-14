ALTER TABLE "user_item_progress" ADD COLUMN "current_correct_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_item_progress" ADD COLUMN "highest_srs_stage_reached" "srs_stage" DEFAULT 'beginner_1' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "grammar_minimum_leech_stage" "srs_stage" DEFAULT 'familiar_1' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "vocabulary_minimum_leech_stage" "srs_stage" DEFAULT 'familiar_1' NOT NULL;