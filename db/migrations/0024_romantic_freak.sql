CREATE TYPE "public"."grammar_placement" AS ENUM('first', 'last', 'no_preference');--> statement-breakpoint
ALTER TYPE "public"."curriculum_mode" ADD VALUE 'default_order';--> statement-breakpoint
ALTER TYPE "public"."curriculum_mode" ADD VALUE 'choose_group';--> statement-breakpoint
ALTER TYPE "public"."curriculum_mode" ADD VALUE 'variety';--> statement-breakpoint
ALTER TABLE "user_language_settings" ADD COLUMN "grammar_placement" "grammar_placement" DEFAULT 'no_preference' NOT NULL;