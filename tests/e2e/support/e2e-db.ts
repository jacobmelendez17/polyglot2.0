import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";
import { assertSafeE2EDatabaseUrl } from "@/db/test/db-safety-guard";

/**
 * Spec 22 — direct database access for Playwright test setup only (never for
 * assertions the UI itself should make). Used to stage preconditions the
 * product has no UI path to create quickly and repeatably — e.g. making a
 * review due without waiting for a real SRS interval, or resetting one
 * learner's state before a spec file that needs to run independently of
 * suite order.
 *
 * A fresh `Pool` per call, closed immediately after — Playwright runs specs
 * across multiple worker/test processes, so a single shared long-lived pool
 * has no clear owner to close it. `assertSafeE2EDatabaseUrl` fails closed if
 * `E2E_DATABASE_URL` is missing, equals `DATABASE_URL`/`TEST_DATABASE_URL`,
 * or the environment is production — the same guard `scripts/e2e-reset.ts`
 * uses.
 */
export async function withE2EDb<T>(fn: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: assertSafeE2EDatabaseUrl() });
  try {
    const db = drizzle(pool, { schema });
    return await fn(db);
  } finally {
    await pool.end();
  }
}
