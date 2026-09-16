import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";

import { assertSafeIntegrationDatabaseUrl } from "./db-safety-guard";

/**
 * Database integration tests use `TEST_DATABASE_URL` (spec 08 §5, §42; spec
 * 22) — a dedicated Neon branch, genuinely isolated from the app's runtime
 * `db` (`db/client.ts`, `DATABASE_URL`). `assertSafeIntegrationDatabaseUrl`
 * fails closed if the two ever converge again (e.g. a misconfigured
 * environment), rather than silently running against the wrong database.
 */
const pool = new Pool({ connectionString: assertSafeIntegrationDatabaseUrl() });

export const testDb = drizzle(pool, { schema });
