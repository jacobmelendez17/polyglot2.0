import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";

/**
 * Lambda-safe Neon binding (spec 19 §31/§48 step 8). Builds its own
 * `Pool`/`drizzle` client rather than importing `db/client.ts` — that
 * module's `import "server-only"` guard throws unconditionally outside a
 * webpack bundle with the `react-server` export condition set, which a
 * plain Lambda Node runtime never has (the same reason
 * `scripts/curriculum-import.ts` and every other CLI in `/scripts` build
 * their own client instead of importing the app's). The domain services
 * this Lambda calls (`bulk-import-service.ts`, `curriculum-import-service.ts`)
 * already accept an injected `DbClient` for exactly this reason.
 *
 * `DATABASE_URL` reaches the Lambda as a plain environment variable (spec
 * 19 §42) — set on the Lambda resource once it's deployed (§48 step 11),
 * not read through `lib/env.ts`, which also requires Clerk/lesson secrets
 * that have nothing to do with this worker.
 */
export function createLambdaDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured for the curriculum-import Lambda.");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}
