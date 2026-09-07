CREATE TYPE "public"."answer_side" AS ENUM('term', 'meaning');--> statement-breakpoint
CREATE TABLE "accepted_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"side" "answer_side" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accepted_answers_item_side_normalized_key" UNIQUE("learning_item_id","side","normalized_value")
);
--> statement-breakpoint
CREATE TABLE "curriculum_item_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"base_version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_item_drafts_learning_item_id_unique" UNIQUE("learning_item_id")
);
--> statement-breakpoint
ALTER TABLE "learning_items" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "accepted_answers" ADD CONSTRAINT "accepted_answers_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_item_drafts" ADD CONSTRAINT "curriculum_item_drafts_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_item_drafts" ADD CONSTRAINT "curriculum_item_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accepted_answers_learning_item_idx" ON "accepted_answers" USING btree ("learning_item_id");--> statement-breakpoint
CREATE INDEX "curriculum_item_drafts_created_by_idx" ON "curriculum_item_drafts" USING btree ("created_by");