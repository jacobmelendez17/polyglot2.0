CREATE TYPE "public"."curriculum_mode" AS ENUM('theme', 'random', 'balanced');--> statement-breakpoint
CREATE TABLE "user_language_settings" (
	"user_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	"curriculum_mode" "curriculum_mode" NOT NULL,
	"selected_vocabulary_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_language_settings_user_id_language_id_pk" PRIMARY KEY("user_id","language_id"),
	CONSTRAINT "user_language_settings_theme_selection_consistency" CHECK ("user_language_settings"."selected_vocabulary_group_id" IS NULL OR "user_language_settings"."curriculum_mode" = 'theme')
);
--> statement-breakpoint
ALTER TABLE "user_language_settings" ADD CONSTRAINT "user_language_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_language_settings" ADD CONSTRAINT "user_language_settings_language_id_languages_id_fk" FOREIGN KEY ("language_id") REFERENCES "public"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_language_settings" ADD CONSTRAINT "user_language_settings_group_language_fk" FOREIGN KEY ("selected_vocabulary_group_id","language_id") REFERENCES "public"."vocabulary_groups"("id","language_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_language_settings_selected_group_idx" ON "user_language_settings" USING btree ("selected_vocabulary_group_id");