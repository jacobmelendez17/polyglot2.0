CREATE TABLE "vocabulary_usage_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"position" integer NOT NULL,
	"source_form" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_usage_contexts_item_position_key" UNIQUE("learning_item_id","position")
);
--> statement-breakpoint
ALTER TABLE "learning_item_sentences" ADD COLUMN "usage_context_id" uuid;--> statement-breakpoint
ALTER TABLE "vocabulary_usage_contexts" ADD CONSTRAINT "vocabulary_usage_contexts_learning_item_id_learning_items_id_fk" FOREIGN KEY ("learning_item_id") REFERENCES "public"."learning_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocabulary_usage_contexts_item_idx" ON "vocabulary_usage_contexts" USING btree ("learning_item_id");--> statement-breakpoint
ALTER TABLE "learning_item_sentences" ADD CONSTRAINT "learning_item_sentences_usage_context_id_vocabulary_usage_contexts_id_fk" FOREIGN KEY ("usage_context_id") REFERENCES "public"."vocabulary_usage_contexts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_item_sentences_usage_context_idx" ON "learning_item_sentences" USING btree ("usage_context_id");