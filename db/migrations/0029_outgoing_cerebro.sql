CREATE TYPE "public"."hint_mode" AS ENUM('hide', 'hint', 'show', 'more', 'always_show_nuance');--> statement-breakpoint
CREATE TYPE "public"."hint_order" AS ENUM('nuance_first', 'translation_first');--> statement-breakpoint
CREATE TYPE "public"."undo_action" AS ENUM('clear_last_character', 'clear_all_characters');--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "grammar_hint_order" "hint_order" DEFAULT 'nuance_first' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "vocabulary_hint_order" "hint_order" DEFAULT 'nuance_first' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "grammar_hint_mode" "hint_mode" DEFAULT 'hint' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "vocabulary_hint_mode" "hint_mode" DEFAULT 'hint' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "autoplay_audio" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "lightning_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "focus_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "auto_highlight_errors" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "show_srs_stage" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "auto_expand_info" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_review_preferences" ADD COLUMN "undo_action" "undo_action" DEFAULT 'clear_last_character' NOT NULL;