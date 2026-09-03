CREATE TYPE "public"."review_result" AS ENUM('advanced', 'penalized');--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"stage_before" "srs_stage" NOT NULL,
	"stage_after" "srs_stage" NOT NULL,
	"required_question_count" integer NOT NULL,
	"incorrect_adjustment_count" integer DEFAULT 0 NOT NULL,
	"result" "review_result" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_learning_item_language_fk" FOREIGN KEY ("learning_item_id","language_id") REFERENCES "public"."learning_items"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_events_history_idx" ON "review_events" USING btree ("user_id","language_id","reviewed_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "review_events_item_window_idx" ON "review_events" USING btree ("user_id","learning_item_id","reviewed_at" DESC NULLS LAST);