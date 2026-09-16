import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import { assertSafeIntegrationDatabaseUrl } from "./db-safety-guard";

/**
 * Vitest global setup for the integration suite (spec 08 §42, spec 22):
 * verifies `TEST_DATABASE_URL` is safe (fails closed otherwise — see
 * db-safety-guard.ts) and applies the current migration history to it once
 * before any integration test runs, so tests never depend on someone having
 * manually run `db:migrate` against the test database first.
 */
export default async function setup() {
  const url = assertSafeIntegrationDatabaseUrl();

  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./db/migrations" });
  } finally {
    await pool.end();
  }
}
