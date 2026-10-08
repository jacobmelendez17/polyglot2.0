import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "@neondatabase/serverless";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { assertSafeIntegrationDatabaseUrl } from "@/db/test/db-safety-guard";

import { MigrationError, runMigrations } from "./run-migrations";

/**
 * Runs the real runner against real PostgreSQL, but with small synthetic
 * migration histories inside a uniquely named throwaway schema (code-standards:
 * "a uniquely named schema") — never the real `public`/`drizzle` schemas, so
 * the shared TEST_DATABASE_URL branch is untouched. Each test proves one
 * property that `drizzle-kit migrate`'s single shared transaction cannot offer.
 */

type FakeMigration = { tag: string; when: number; statements: string[] };

let pool: Pool;
let schema: string;
let folder: string;

function writeMigrations(migrations: FakeMigration[]): void {
  mkdirSync(join(folder, "meta"), { recursive: true });
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: migrations.map((migration, idx) => ({
        idx,
        version: "7",
        when: migration.when,
        tag: migration.tag,
        breakpoints: true,
      })),
    }),
  );
  for (const migration of migrations) {
    writeFileSync(
      join(folder, `${migration.tag}.sql`),
      migration.statements.join("\n--> statement-breakpoint\n"),
    );
  }
}

function run() {
  return runMigrations(pool, {
    migrationsFolder: folder,
    migrationsSchema: schema,
    migrationsTable: "ledger",
  });
}

async function exists(relation: string): Promise<boolean> {
  const result = await pool.query<{ found: string | null }>(
    "select to_regclass($1) as found",
    [`"${schema}"."${relation}"`],
  );
  return result.rows[0].found !== null;
}

async function recordedTimestamps(): Promise<string[]> {
  const result = await pool.query<{ created_at: string }>(
    `select created_at from "${schema}"."ledger" order by created_at`,
  );
  return result.rows.map((row) => row.created_at);
}

beforeAll(() => {
  pool = new Pool({ connectionString: assertSafeIntegrationDatabaseUrl() });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  schema = `mr_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  folder = mkdtempSync(join(tmpdir(), "run-migrations-"));
  await pool.query(`create schema "${schema}"`);
});

afterEach(async () => {
  await pool.query(`drop schema if exists "${schema}" cascade`);
  rmSync(folder, { recursive: true, force: true });
});

describe("runMigrations (real PostgreSQL)", () => {
  it("applies a migration that uses an enum value added by an earlier, already-committed migration", async () => {
    writeMigrations([
      {
        tag: "0000_type",
        when: 1_000,
        statements: [`CREATE TYPE "${schema}"."mood" AS ENUM ('calm');`],
      },
      {
        tag: "0001_add_value",
        when: 2_000,
        statements: [`ALTER TYPE "${schema}"."mood" ADD VALUE 'happy';`],
      },
      {
        tag: "0002_use_value",
        when: 3_000,
        statements: [
          `CREATE TABLE "${schema}"."person" ("id" integer, "mood" "${schema}"."mood" DEFAULT 'happy' NOT NULL);`,
        ],
      },
    ]);

    const result = await run();

    expect(result.applied).toEqual([
      "0000_type",
      "0001_add_value",
      "0002_use_value",
    ]);
    await pool.query(`insert into "${schema}"."person" ("id") values (1)`);
    const row = await pool.query<{ mood: string }>(
      `select mood from "${schema}"."person"`,
    );
    expect(row.rows[0].mood).toBe("happy");
  });

  it("control: PostgreSQL rejects that same sequence inside one shared transaction", async () => {
    // This is the behavior of `drizzle-kit migrate` the runner exists to avoid.
    await pool.query(`CREATE TYPE "${schema}"."mood" AS ENUM ('calm')`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`ALTER TYPE "${schema}"."mood" ADD VALUE 'happy'`);
      await expect(
        client.query(
          `CREATE TABLE "${schema}"."person" ("mood" "${schema}"."mood" DEFAULT 'happy')`,
        ),
      ).rejects.toMatchObject({ code: "55P04" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("runs a CONCURRENTLY migration outside a transaction and leaves a valid index", async () => {
    writeMigrations([
      {
        tag: "0000_table",
        when: 1_000,
        statements: [
          `CREATE TABLE "${schema}"."person" ("id" integer, "name" text);`,
        ],
      },
      {
        tag: "0001_concurrent_index",
        when: 2_000,
        statements: [
          `CREATE UNIQUE INDEX CONCURRENTLY "person_name_key" ON "${schema}"."person" ("name");`,
        ],
      },
      {
        tag: "0002_after",
        when: 3_000,
        statements: [
          `ALTER TABLE "${schema}"."person" ADD COLUMN "age" integer;`,
        ],
      },
    ]);

    const result = await run();

    expect(result.applied).toHaveLength(3);
    const index = await pool.query<{ indisvalid: boolean }>(
      `select i.indisvalid
         from pg_index i
         join pg_class c on c.oid = i.indexrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relname = 'person_name_key'`,
      [schema],
    );
    expect(index.rows).toEqual([{ indisvalid: true }]);
    expect(await recordedTimestamps()).toEqual(["1000", "2000", "3000"]);
  });

  it("rolls back only the failing migration, keeps earlier ones, and reports where it failed", async () => {
    writeMigrations([
      {
        tag: "0000_ok",
        when: 1_000,
        statements: [`CREATE TABLE "${schema}"."kept" ("id" integer);`],
      },
      {
        tag: "0001_broken",
        when: 2_000,
        statements: [
          `CREATE TABLE "${schema}"."rolled_back" ("id" integer);`,
          `INSERT INTO "${schema}"."does_not_exist" VALUES (1);`,
        ],
      },
      {
        tag: "0002_never_reached",
        when: 3_000,
        statements: [`CREATE TABLE "${schema}"."never" ("id" integer);`],
      },
    ]);

    const error = await run().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MigrationError);
    if (!(error instanceof MigrationError)) throw error;
    expect(error.tag).toBe("0001_broken");
    expect(error.message).toContain(
      "Migration 0001_broken failed at statement 2 of 2",
    );
    expect(error.message).toContain("does_not_exist");
    expect(error.message).toContain("SQLSTATE 42P01");

    expect(await exists("kept")).toBe(true);
    expect(await exists("rolled_back")).toBe(false);
    expect(await exists("never")).toBe(false);
    expect(await recordedTimestamps()).toEqual(["1000"]);
  });

  it("resumes from the failed migration once it is fixed", async () => {
    writeMigrations([
      {
        tag: "0000_ok",
        when: 1_000,
        statements: [`CREATE TABLE "${schema}"."first" ("id" integer);`],
      },
      {
        tag: "0001_broken",
        when: 2_000,
        statements: [`INSERT INTO "${schema}"."nope" VALUES (1);`],
      },
    ]);
    await expect(run()).rejects.toBeInstanceOf(MigrationError);

    writeMigrations([
      {
        tag: "0000_ok",
        when: 1_000,
        statements: [`CREATE TABLE "${schema}"."first" ("id" integer);`],
      },
      {
        tag: "0001_broken",
        when: 2_000,
        statements: [`CREATE TABLE "${schema}"."second" ("id" integer);`],
      },
    ]);
    const result = await run();

    expect(result).toEqual({ applied: ["0001_broken"], alreadyApplied: 1 });
    expect(await exists("second")).toBe(true);
  });

  it("is idempotent and applies only newly added migrations", async () => {
    const first: FakeMigration = {
      tag: "0000_a",
      when: 1_000,
      statements: [`CREATE TABLE "${schema}"."a" ("id" integer);`],
    };
    const second: FakeMigration = {
      tag: "0001_b",
      when: 2_000,
      statements: [`CREATE TABLE "${schema}"."b" ("id" integer);`],
    };

    writeMigrations([first]);
    expect(await run()).toEqual({ applied: ["0000_a"], alreadyApplied: 0 });
    expect(await run()).toEqual({ applied: [], alreadyApplied: 1 });

    writeMigrations([first, second]);
    expect(await run()).toEqual({ applied: ["0001_b"], alreadyApplied: 1 });
  });

  it("records exactly what drizzle records: sha256 of the file and the journal's `when`", async () => {
    writeMigrations([
      {
        tag: "0000_a",
        when: 1_234_567,
        statements: [
          `CREATE TABLE "${schema}"."a" ("id" integer);`,
          `ALTER TABLE "${schema}"."a" ADD COLUMN "b" text;`,
        ],
      },
    ]);

    await run();

    const rows = await pool.query<{ hash: string; created_at: string }>(
      `select hash, created_at from "${schema}"."ledger"`,
    );
    const fileContents = readFileSync(join(folder, "0000_a.sql"), "utf8");
    expect(rows.rows).toEqual([
      {
        hash: createHash("sha256").update(fileContents).digest("hex"),
        created_at: "1234567",
      },
    ]);
  });
});
