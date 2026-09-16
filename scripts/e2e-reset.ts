import { config } from "dotenv";

// Runs as a standalone `tsx` CLI script — load .env.local before anything
// else touches process.env, same as db/seed/run.ts and drizzle.config.ts.
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import * as schema from "@/db/schema";
import { seedE2EFixtures } from "@/db/seed/e2e-fixtures";
import { assertSafeE2EDatabaseUrl } from "@/db/test/db-safety-guard";

/**
 * `npm run e2e:setup` (spec 22's "E2E Database Reset"). Brings
 * `E2E_DATABASE_URL` to a deterministic known state before a Playwright run:
 *
 * 1. verify the target is safe (fails closed — see db-safety-guard.ts)
 * 2. drop and recreate the schema, so leftover state from a previous run
 *    (or from the branch's own creation-time copy of its parent) can never
 *    carry forward
 * 3. apply every migration from empty to head
 * 4. seed the deterministic es-MX curriculum fixture and the two permanent
 *    Clerk-linked learner/admin user records
 *
 * Destructive by design — this is the one script allowed to drop the E2E
 * schema — and safe only because assertSafeE2EDatabaseUrl proves the target
 * is never DATABASE_URL, TEST_DATABASE_URL, or a production environment.
 */
async function main() {
  const e2eUrl = assertSafeE2EDatabaseUrl();
  const learnerClerkUserId = process.env.E2E_LEARNER_CLERK_USER_ID;
  const adminClerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;
  if (!learnerClerkUserId || !adminClerkUserId) {
    throw new Error(
      "E2E_LEARNER_CLERK_USER_ID and E2E_ADMIN_CLERK_USER_ID are required to run e2e:setup. Set them in .env.local — see .env.example.",
    );
  }

  const pool = new Pool({ connectionString: e2eUrl });
  try {
    console.log("Resetting the E2E database schema...");
    // The `drizzle` migration-tracking schema is not touched by resetting
    // `public` alone — a Neon branch created from a migrated parent copies
    // both, so both must be dropped for `drizzle-kit`'s migrator to actually
    // reapply every migration rather than trusting a copied ledger.
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE;");

    console.log("Applying migrations...");
    const migrationDb = drizzle(pool);
    await migrate(migrationDb, { migrationsFolder: "./db/migrations" });

    console.log("Seeding the E2E curriculum fixture and test identities...");
    const db = drizzle(pool, { schema });
    const ids = await seedE2EFixtures(db, { learnerClerkUserId, adminClerkUserId });
    console.log("E2E database ready:", {
      languageId: ids.languageId,
      levelId: ids.levelId,
      vocabularyItems: Object.keys(ids.vocabularyItemIdByTerm).length,
      grammarItems: Object.keys(ids.grammarItemIdByStructure).length,
      pendingItemTerm: ids.pendingItemTerm,
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("E2E database reset failed:", error);
  process.exitCode = 1;
});
