import { config } from "dotenv";

// Runs as a standalone `tsx` CLI script — load .env.local before anything
// else touches process.env, same as run.ts and drizzle.config.ts.
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";
import { cleanupExpiredIdempotencyKeys } from "@/domains/idempotency";

/**
 * `npm run db:cleanup-idempotency` (spec 08 §53's Retention section).
 * Deletes idempotency key rows past `expires_at`. Scheduling this is an
 * explicitly deferred operational concern — this is the script a future
 * cron/scheduled job would invoke.
 *
 * Constructs its own client directly rather than importing `db/client.ts` —
 * that module's `import "server-only"` guard throws outside Next's webpack
 * build; `tsx` runs this as plain Node. See `db/seed/run.ts` for the same
 * pattern and why.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the cleanup script. Set it in .env.local.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    const deletedCount = await cleanupExpiredIdempotencyKeys(db);
    console.log(`Deleted ${deletedCount} expired idempotency key row(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Idempotency cleanup failed:", error);
  process.exitCode = 1;
});
