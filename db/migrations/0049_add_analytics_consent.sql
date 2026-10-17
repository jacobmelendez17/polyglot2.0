CREATE TYPE "public"."analytics_consent_status" AS ENUM('accepted', 'declined');--> statement-breakpoint
CREATE TABLE "user_analytics_consent" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" "analytics_consent_status" NOT NULL,
	"policy_version" text NOT NULL,
	"analytics_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_analytics_consent_analytics_id_unique" UNIQUE("analytics_id"),
	CONSTRAINT "user_analytics_consent_accepted_has_id" CHECK ("user_analytics_consent"."status" <> 'accepted' OR "user_analytics_consent"."analytics_id" IS NOT NULL),
	CONSTRAINT "user_analytics_consent_revision_positive" CHECK ("user_analytics_consent"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "user_analytics_consent" ADD CONSTRAINT "user_analytics_consent_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;