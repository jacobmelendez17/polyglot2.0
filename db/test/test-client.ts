import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";

/**
 * Database integration tests use `TEST_DATABASE_URL` (spec 08 §5, §42) — a
 * deliberately separate connection from the app's runtime `db` (`db/client.ts`,
 * `DATABASE_URL`). They currently resolve to the same Neon branch (see
 * progress-tracker.md), but keeping the client itself separate means that
 * remains a config choice, not something load-bearing baked into test code —
 * if the two URLs ever diverge (e.g. in production, where TEST_DATABASE_URL
 * should never be set at all), tests fail loudly instead of silently running
 * against the wrong database.
 */
function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required to run database integration tests. Set it in .env.local — see .env.example.",
    );
  }
  return url;
}

const pool = new Pool({ connectionString: getTestDatabaseUrl() });

export const testDb = drizzle(pool, { schema });
