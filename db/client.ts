import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { NeonQueryResultHKT } from "drizzle-orm/neon-serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { env } from "@/lib/env";

import * as schema from "./schema";

/**
 * The one authoritative database-client module (spec 08 §6). Application
 * code reaches the database only through the repository/domain layer, which
 * imports `db` from here — never by constructing a separate connection.
 *
 * Uses `@neondatabase/serverless`'s `Pool` with `drizzle-orm/neon-serverless`
 * (spec 08 §3), not `neon-http` — the HTTP adapter cannot perform
 * interactive transactions, and architecture.md requires real transactions
 * for atomic review/lesson-enrollment/idempotency work. This does not run
 * migrations; that stays an explicit operational step (`npm run db:migrate`),
 * never application startup or a request.
 */
const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/**
 * The common structural supertype of `Database` and a Drizzle transaction
 * handle (e.g. `db/test/with-test-transaction.ts`'s `TestTx`) — both
 * `NeonDatabase` and `NeonTransaction` extend `PgDatabase`, but `Database`
 * itself additionally requires a live `$client: Pool`, which a transaction
 * handle doesn't carry. Repository functions that need to run against
 * either the real app database or a test transaction (spec 08 §57, §62)
 * should accept this type instead of `Database`.
 */
export type DbClient = PgDatabase<NeonQueryResultHKT, typeof schema>;
