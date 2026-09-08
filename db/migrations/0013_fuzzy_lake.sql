ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
-- Spec 15 backfill (user decision, 2026-09-09). Onboarding is shown "after
-- first successful account creation"; every row that already exists predates
-- the feature and was not just created, so it is marked complete rather than
-- routed into a welcome tour on its next visit. New rows are provisioned with
-- NULL and see onboarding normally.
--
-- Safe against the previously deployed application version: that version does
-- not read this column at all, so both the ADD COLUMN and this UPDATE are
-- invisible to it. Non-destructive — it only fills a column that was NULL a
-- statement ago, and it can run while the application serves traffic.
UPDATE "users" SET "onboarding_completed_at" = now() WHERE "onboarding_completed_at" IS NULL;
