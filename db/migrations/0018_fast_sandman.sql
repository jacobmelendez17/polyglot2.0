CREATE TYPE "public"."cefr_level" AS ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2');--> statement-breakpoint
CREATE TYPE "public"."grammar_content_block_type" AS ENUM('text', 'example', 'note');--> statement-breakpoint
CREATE TYPE "public"."register" AS ENUM('neutral', 'formal', 'informal', 'colloquial', 'slang', 'vulgar', 'literary');--> statement-breakpoint
CREATE TABLE "grammar_content_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"type" "grammar_content_block_type" NOT NULL,
	"position" integer NOT NULL,
	"body" text,
	"target_text" text,
	"translation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_content_blocks_item_position_key" UNIQUE("learning_item_id","position"),
	CONSTRAINT "grammar_content_blocks_shape_check" CHECK ((
        ("grammar_content_blocks"."type" in ('text', 'note') and "grammar_content_blocks"."body" is not null and "grammar_content_blocks"."target_text" is null and "grammar_content_blocks"."translation" is null)
        or ("grammar_content_blocks"."type" = 'example' and "grammar_content_blocks"."body" is null and "grammar_content_blocks"."target_text" is not null and "grammar_content_blocks"."translation" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "learning_item_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_item_resources_item_position_key" UNIQUE("learning_item_id","position")
);
--> statement-breakpoint
ALTER TABLE "grammar_items" ADD COLUMN "register" "register";--> statement-breakpoint
ALTER TABLE "levels" ADD COLUMN "cefr_level" "cefr_level";--> statement-breakpoint
ALTER TABLE "vocabulary_items" ADD COLUMN "register" "register";--> statement-breakpoint
ALTER TABLE "grammar_content_blocks" ADD CONSTRAINT "grammar_content_blocks_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_item_resources" ADD CONSTRAINT "learning_item_resources_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grammar_content_blocks_item_idx" ON "grammar_content_blocks" USING btree ("learning_item_id");--> statement-breakpoint
CREATE INDEX "learning_item_resources_item_idx" ON "learning_item_resources" USING btree ("learning_item_id");