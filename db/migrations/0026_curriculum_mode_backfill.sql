-- Spec 20 Lessons — Curriculum Preference Migration. Data-only: backfills
-- every existing `user_language_settings` row from the old learner-facing
-- terminology to the new one, per spec 20's explicit mapping:
--   theme              -> choose_group
--   random, balanced   -> variety
-- No schema shape changes here (the previous migration already widened the
-- enum and the check constraint), so this migration's snapshot is identical
-- to 0025's. Hand-written rather than generated — drizzle-kit only diffs
-- schema shape, never data.
--
-- A single unbatched UPDATE, not a batched backfill: the real table has a
-- handful of rows at this stage of the beta (confirmed directly against the
-- dev database before writing this), so code-standards.md's "backfills are
-- batched and resumable" guidance — aimed at tables where one UPDATE could
-- hold a long lock — does not apply here. Revisit if this table ever grows
-- large before every account has already migrated off the old values.
UPDATE "user_language_settings" SET "curriculum_mode" = 'choose_group' WHERE "curriculum_mode" = 'theme';--> statement-breakpoint
UPDATE "user_language_settings" SET "curriculum_mode" = 'variety' WHERE "curriculum_mode" IN ('random', 'balanced');
