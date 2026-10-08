import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Pool, PoolClient } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { z } from "zod";

/**
 * The project's migration runner (`npm run db:migrate`, `scripts/migrate.ts`).
 *
 * Why this replaces `drizzle-kit migrate` / `drizzle-orm`'s `migrate()`: both
 * wrap every pending migration file into ONE shared transaction before
 * running any statement (confirmed in `drizzle-orm`'s `pg-core/dialect.js`).
 * That cannot apply this repository's history to an empty database:
 * `CREATE INDEX CONCURRENTLY` (0043) is illegal inside a transaction block
 * (SQLSTATE 25001). Environments migrated incrementally never hit it, because
 * 0043 was applied on its own through `db:migrate-concurrent`; a from-empty
 * run (a new production database, `e2e:setup`, `migrate.yml`'s empty-to-head
 * check) always does.
 *
 * A second, latent hazard of one shared transaction: a value added with
 * `ALTER TYPE ... ADD VALUE` to an enum that is already committed cannot be
 * used until the adding transaction commits (SQLSTATE 55P04). This history
 * does not trip it from empty (those enum types are created in the same
 * transaction, which makes their values safe), but any environment whose
 * enum types predate a pending batch — e.g. a preview branch forked from an
 * older parent — can.
 *
 * This runner applies each migration in its own transaction, and runs a
 * migration that contains `CONCURRENTLY` outside one.
 *
 * It deliberately keeps drizzle's bookkeeping contract byte-for-byte — the
 * same `drizzle.__drizzle_migrations` table, the same sha256 `hash` of the
 * file contents, `created_at` = the journal entry's `when`, and drizzle's
 * "apply everything newer than the latest recorded `created_at`" rule — so
 * existing databases (dev, test, E2E, anything already migrated by
 * drizzle-kit or `db:migrate-concurrent`) see no difference, and
 * `drizzle-kit generate`/`check` keep working unchanged.
 */

const DEFAULT_MIGRATIONS_SCHEMA = "drizzle";
const DEFAULT_MIGRATIONS_TABLE = "__drizzle_migrations";

export type RunMigrationsOptions = {
  /** Directory holding `meta/_journal.json` and the `<tag>.sql` files. */
  migrationsFolder: string;
  /** Bookkeeping schema. Production code always uses drizzle's default; tests pass a throwaway one. */
  migrationsSchema?: string;
  /** Bookkeeping table. Same note as `migrationsSchema`. */
  migrationsTable?: string;
  /** Progress sink; silent by default. */
  log?: (message: string) => void;
};

export type RunMigrationsResult = {
  /** Tags applied by this run, in order. */
  applied: string[];
  /** Migrations already recorded before this run started. */
  alreadyApplied: number;
};

type Migration = {
  tag: string;
  statements: string[];
  hash: string;
  folderMillis: number;
};

const journalSchema = z.object({
  entries: z.array(z.object({ tag: z.string().min(1) })),
});

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Quotes a schema/table name after proving it is a plain identifier — these are interpolated into SQL, never bound as parameters. */
export function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(identifier)}`);
  }
  return `"${identifier}"`;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/**
 * True when a migration contains a statement Postgres refuses inside a
 * transaction block. Only `CONCURRENTLY` exists in this history; comments are
 * ignored so a note mentioning the word doesn't change how a file runs.
 */
export function mustRunOutsideTransaction(
  statements: readonly string[],
): boolean {
  return statements.some((statement) =>
    /\bCONCURRENTLY\b/i.test(stripSqlComments(statement)),
  );
}

function readStringField(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" ? value : undefined;
}

function excerpt(statement: string): string {
  const collapsed = statement.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 200)}...` : collapsed;
}

type MigrationFailure = {
  tag: string;
  /** 1-based; `null` when recording the migration as applied failed instead. */
  statementNumber: number | null;
  statementCount: number;
  statement: string | null;
  ranInTransaction: boolean;
  cause: unknown;
};

/**
 * Builds the failure message. drizzle-kit's spinner swallows the underlying
 * Postgres error in non-TTY CI logs, which is what made the first production
 * deploy undiagnosable — so the message states the migration, the statement,
 * the SQLSTATE, and the server's own detail/hint in plain text.
 */
export function describeMigrationFailure(failure: MigrationFailure): string {
  const reason =
    failure.cause instanceof Error
      ? failure.cause.message
      : String(failure.cause);
  const code = readStringField(failure.cause, "code");
  const detail = readStringField(failure.cause, "detail");
  const hint = readStringField(failure.cause, "hint");

  const where =
    failure.statementNumber === null || failure.statement === null
      ? "while recording it as applied"
      : `at statement ${failure.statementNumber} of ${failure.statementCount}`;

  const lines = [
    `Migration ${failure.tag} failed ${where}: ${reason}${code ? ` (SQLSTATE ${code})` : ""}`,
  ];
  if (failure.statement !== null)
    lines.push(`  statement: ${excerpt(failure.statement)}`);
  if (detail) lines.push(`  detail: ${detail}`);
  if (hint) lines.push(`  hint: ${hint}`);
  lines.push(
    failure.ranInTransaction
      ? "  The migration ran in a transaction and was rolled back; earlier migrations stay applied."
      : "  This migration runs outside a transaction (it contains CONCURRENTLY), so statements before the failing one may already have taken effect. Check for an INVALID index (pg_index.indisvalid = false) and drop it before re-running.",
  );
  return lines.join("\n");
}

export class MigrationError extends Error {
  readonly tag: string;

  constructor(failure: MigrationFailure) {
    super(describeMigrationFailure(failure), { cause: failure.cause });
    this.name = "MigrationError";
    this.tag = failure.tag;
  }
}

function loadMigrations(migrationsFolder: string): Migration[] {
  // Reuse drizzle's own reader so `hash` and `folderMillis` can never drift
  // from what drizzle-kit/`db:migrate-concurrent` already recorded.
  const files = readMigrationFiles({ migrationsFolder });
  const journal = journalSchema.parse(
    JSON.parse(
      readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
    ),
  );
  if (journal.entries.length !== files.length) {
    throw new Error(
      `Journal lists ${journal.entries.length} migrations but ${files.length} were read from ${migrationsFolder}.`,
    );
  }
  // readMigrationFiles returns one entry per journal entry, in journal order.
  return files.map((file, index) => ({
    tag: journal.entries[index].tag,
    statements: file.sql,
    hash: file.hash,
    folderMillis: file.folderMillis,
  }));
}

async function applyMigration(
  client: PoolClient,
  qualifiedTable: string,
  migration: Migration,
): Promise<void> {
  const ranInTransaction = !mustRunOutsideTransaction(migration.statements);
  // Whitespace-only fragments (e.g. a trailing breakpoint) are not statements.
  const statements = migration.statements.filter(
    (statement) => statement.trim().length > 0,
  );

  let current: { number: number; statement: string } | null = null;
  try {
    if (ranInTransaction) await client.query("BEGIN");
    for (const [index, statement] of statements.entries()) {
      current = { number: index + 1, statement };
      await client.query(statement);
    }
    current = null;
    await client.query(
      `INSERT INTO ${qualifiedTable} ("hash", "created_at") VALUES ($1, $2)`,
      [migration.hash, migration.folderMillis],
    );
    if (ranInTransaction) await client.query("COMMIT");
  } catch (cause) {
    if (ranInTransaction) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw new MigrationError({
      tag: migration.tag,
      statementNumber: current?.number ?? null,
      statementCount: statements.length,
      statement: current?.statement ?? null,
      ranInTransaction,
      cause,
    });
  }
}

export async function runMigrations(
  pool: Pool,
  options: RunMigrationsOptions,
): Promise<RunMigrationsResult> {
  const schema = quoteIdentifier(
    options.migrationsSchema ?? DEFAULT_MIGRATIONS_SCHEMA,
  );
  const table = quoteIdentifier(
    options.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE,
  );
  const qualifiedTable = `${schema}.${table}`;
  const log = options.log ?? (() => undefined);

  const migrations = loadMigrations(options.migrationsFolder);

  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );

    // drizzle's rule: everything strictly newer than the latest recorded
    // `created_at` is pending (a watermark, not a per-hash set).
    const latest = await client.query<{ created_at: string | null }>(
      `SELECT created_at FROM ${qualifiedTable} ORDER BY created_at DESC LIMIT 1`,
    );
    const latestRow = latest.rows[0];
    const pending = migrations.filter(
      (migration) =>
        !latestRow || Number(latestRow.created_at) < migration.folderMillis,
    );

    const applied: string[] = [];
    for (const migration of pending) {
      log(`Applying ${migration.tag}`);
      await applyMigration(client, qualifiedTable, migration);
      applied.push(migration.tag);
    }

    return { applied, alreadyApplied: migrations.length - pending.length };
  } finally {
    client.release();
  }
}
