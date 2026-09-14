CREATE TABLE "user_vacation_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_vacation_periods" ADD CONSTRAINT "user_vacation_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_vacation_periods_one_active_per_user" ON "user_vacation_periods" USING btree ("user_id") WHERE "user_vacation_periods"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "user_vacation_periods_user_id_started_at_idx" ON "user_vacation_periods" USING btree ("user_id","started_at" DESC NULLS LAST);