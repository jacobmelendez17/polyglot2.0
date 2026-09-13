CREATE TYPE "public"."content_classification" AS ENUM('safe', 'nsfw');--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"hide_english_reviews" boolean DEFAULT false NOT NULL,
	"show_nsfw_content" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_items" ADD COLUMN "content_classification" "content_classification" DEFAULT 'safe' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentences" ADD COLUMN "content_classification" "content_classification" DEFAULT 'safe' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;