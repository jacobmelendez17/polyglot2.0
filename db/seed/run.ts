import { config } from "dotenv";

// Runs as a standalone `tsx` CLI script, outside Next.js's own env loading
// and outside Vite/webpack — load .env.local the same way drizzle.config.ts
// does, before anything else touches process.env.
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";

import { seedTestFixtures } from "./test-fixtures";

/**
 * `npm run db:seed` (spec 08 §37, §39). Deliberately constructs its own
 * client directly with `Pool`/`drizzle()` rather than importing `db/client.ts`
 * — that module's `import "server-only"` guard throws unconditionally
 * outside Next's webpack build (confirmed while wiring up spec 08 unit 3's
 * integration tests; see progress-tracker.md), and `tsx` runs this as plain
 * Node, same as Vitest. `db/test/global-setup.ts` uses the same workaround
 * for the same reason.
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the seed script. Set it in .env.local.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    const ids = await seedTestFixtures(db);
    console.log("Seeded deterministic fixtures:", ids);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
