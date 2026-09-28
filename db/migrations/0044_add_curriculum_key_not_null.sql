ALTER TABLE "learning_items" ALTER COLUMN "curriculum_key" SET DEFAULT ('unassigned:' || gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "learning_items" ALTER COLUMN "curriculum_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "levels" ALTER COLUMN "curriculum_key" SET DEFAULT ('unassigned:' || gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "levels" ALTER COLUMN "curriculum_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vocabulary_groups" ALTER COLUMN "curriculum_key" SET DEFAULT ('unassigned:' || gen_random_uuid()::text);--> statement-breakpoint
ALTER TABLE "vocabulary_groups" ALTER COLUMN "curriculum_key" SET NOT NULL;