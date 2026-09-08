CREATE TYPE "public"."deck_availability" AS ENUM('level', 'theme');--> statement-breakpoint
CREATE TYPE "public"."deck_kind" AS ENUM('polyglot', 'personal');--> statement-breakpoint
CREATE TABLE "deck_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"learning_item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_items_deck_id_learning_item_id_key" UNIQUE("deck_id","learning_item_id"),
	CONSTRAINT "deck_items_deck_id_position_key" UNIQUE("deck_id","position")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_id" uuid NOT NULL,
	"kind" "deck_kind" NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"availability" "deck_availability" NOT NULL,
	"gate_level_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_id_language_id_key" UNIQUE("id","language_id"),
	CONSTRAINT "decks_shape_check" CHECK ((
        (kind = 'personal' AND owner_user_id IS NOT NULL AND availability = 'theme' AND gate_level_id IS NULL)
        OR (kind = 'polyglot' AND owner_user_id IS NULL AND availability = 'theme' AND gate_level_id IS NULL)
        OR (kind = 'polyglot' AND owner_user_id IS NULL AND availability = 'level' AND gate_level_id IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "deck_items" ADD CONSTRAINT "deck_items_deck_language_fk" FOREIGN KEY ("deck_id","language_id") REFERENCES "public"."decks"("id","language_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_items" ADD CONSTRAINT "deck_items_learning_item_language_fk" FOREIGN KEY ("learning_item_id","language_id") REFERENCES "public"."learning_items"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_gate_level_id_levels_id_fk" FOREIGN KEY ("gate_level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_items_learning_item_idx" ON "deck_items" USING btree ("learning_item_id");--> statement-breakpoint
CREATE INDEX "decks_owner_language_idx" ON "decks" USING btree ("owner_user_id","language_id");--> statement-breakpoint
CREATE INDEX "decks_kind_language_idx" ON "decks" USING btree ("kind","language_id");