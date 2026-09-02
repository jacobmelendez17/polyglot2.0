import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

/**
 * Vitest global setup for the integration suite (spec 08 §42): applies the
 * current migration history to `TEST_DATABASE_URL` once before any
 * integration test runs, so tests never depend on someone having manually
 * run `db:migrate` against the test database first.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required to run database integration tests. Set it in .env.local — see .env.example.",
    );
  }

  const pool = new Pool({ connectionString: url });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./db/migrations" });
  } finally {
    await pool.end();
  }
}
