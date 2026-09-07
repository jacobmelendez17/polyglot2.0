-- Spec 12 follow-up to 0007: `lexical_imports`'s idempotency key was
-- (source, file checksum) alone, which also skipped a *different* scope over
-- the same dump — so widening a CURRICULUM-scope import to FULL_LANGUAGE
-- would have been silently refused. `scope_key` makes the scope part of the
-- key. 0007 has not been released, so nothing deployed depends on the old
-- constraint; it is still replaced additively rather than edited in place,
-- per the append-only migration rule.
--
-- Hand-adjusted from the generator's output: drizzle-kit emitted a bare
-- `ADD COLUMN ... NOT NULL`, which fails against any existing row. The column
-- is added nullable, backfilled from each row's own scope, and only then
-- constrained.
ALTER TABLE "lexical_imports" ADD COLUMN "scope_key" text;--> statement-breakpoint
UPDATE "lexical_imports" SET "scope_key" = "scope"::text WHERE "scope_key" IS NULL;--> statement-breakpoint
ALTER TABLE "lexical_imports" ALTER COLUMN "scope_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lexical_imports" DROP CONSTRAINT "lexical_imports_source_checksum_key";--> statement-breakpoint
ALTER TABLE "lexical_imports" ADD CONSTRAINT "lexical_imports_source_checksum_scope_key" UNIQUE("source_id","file_checksum","scope_key");
