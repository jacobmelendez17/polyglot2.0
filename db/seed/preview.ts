import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { users } from "@/db/schema";
import { seedE2EFixtures } from "./e2e-fixtures";

/**
 * Spec 23's Preview Migrations/Preview Database — seeds a pull request's
 * Vercel Preview deployment with "safe curriculum/test fixtures" during
 * Vercel's own build step (see `scripts/vercel-build.mjs`), never production
 * data. Reuses spec 22's E2E fixture set (`db/seed/e2e-fixtures.ts`) rather
 * than inventing a second parallel fixture curriculum: it is already the one
 * dataset the committed Playwright suite (`e2e.yml`) knows how to drive, so
 * seeding preview with anything else would make Critical E2E fail against
 * its own preview for a reason unrelated to the pull request under test.
 *
 * Deliberately non-destructive, unlike `scripts/e2e-reset.ts` — a Vercel
 * build must never drop the schema of the database its own app is about to
 * serve from. Idempotent by checking for the E2E learner identity first:
 * Neon's Vercel integration keys a preview branch to the git branch, not the
 * individual deployment (architecture.md's Preview Database section), so a
 * second push to the same pull request re-runs this against an
 * already-seeded branch.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const learnerClerkUserId = process.env.E2E_LEARNER_CLERK_USER_ID;
  const adminClerkUserId = process.env.E2E_ADMIN_CLERK_USER_ID;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the preview database.");
  }
  if (!learnerClerkUserId || !adminClerkUserId) {
    // Preview builds can legitimately run without these set (e.g. a first
    // connectivity check before the Clerk E2E identities exist in Vercel's
    // Preview environment variables) — skip seeding rather than fail the
    // build outright, since an unseeded preview only affects `e2e.yml`, a
    // separate required check.
    console.warn(
      "E2E_LEARNER_CLERK_USER_ID / E2E_ADMIN_CLERK_USER_ID are not set — skipping preview fixture seed.",
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });

    const [existingLearner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, learnerClerkUserId))
      .limit(1);

    if (existingLearner) {
      console.log("Preview database already seeded — skipping.");
      return;
    }

    const ids = await seedE2EFixtures(db, {
      learnerClerkUserId,
      adminClerkUserId,
    });
    console.log("Seeded preview fixtures:", {
      languageId: ids.languageId,
      levelId: ids.levelId,
      vocabularyItems: Object.keys(ids.vocabularyItemIdByTerm).length,
      grammarItems: Object.keys(ids.grammarItemIdByStructure).length,
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Preview seeding failed:", error);
  process.exitCode = 1;
});
