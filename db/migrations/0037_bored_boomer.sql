CREATE TABLE "user_dismissed_notices" (
	"user_id" uuid NOT NULL,
	"notice_key" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_dismissed_notices_user_id_notice_key_pk" PRIMARY KEY("user_id","notice_key")
);
--> statement-breakpoint
CREATE TABLE "user_streak_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_dismissed_notices" ADD CONSTRAINT "user_dismissed_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streak_adjustments" ADD CONSTRAINT "user_streak_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_streak_adjustments_user_id_created_at_idx" ON "user_streak_adjustments" USING btree ("user_id","created_at" DESC NULLS LAST);