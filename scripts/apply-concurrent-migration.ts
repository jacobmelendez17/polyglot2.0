import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool } from "@neondatabase/serverless";

/**
 * `npm run db:migrate-concurrent -- <migration_tag>` (spec: Next Up #27's
 * investigation, 2026-09-17).
 *
 * Why this exists: `npm run db:migrate` (`drizzle-kit migrate`) wraps every
 * pending migration file into **one shared transaction** before running any
 * of their statements — confirmed by reading the installed
 * `drizzle-orm/pg-core/dialect.js` directly, not assumed. Postgres
 * unconditionally rejects `CREATE INDEX CONCURRENTLY` (and any other
 * statement that must run outside a transaction block) inside that
 * transaction, so no schema- or migration-authoring choice can make that
 * combination work through the normal path. This script is the side
 * channel: it runs one migration file's statements directly against a plain,
 * non-transactional connection, then hand-writes the same bookkeeping row
 * `drizzle-kit migrate` would have written (same `hash`, same `created_at`),
 * so a later `db:migrate`/`db:verify` sees it as already applied instead of
 * re-attempting it or reporting drift.
 *
 * Safety: refuses to run against a migration file that doesn't actually
 * contain `CONCURRENTLY` — an ordinary migration belongs in the normal
 * `db:migrate` path, which gives up nothing this script does (this script's
 * non-transactional, statement-by-statement execution has no "all or
 * nothing" guarantee if one statement fails partway through).
 *
 * Ordering: `drizzle-kit migrate` applies its pending batch in journal order
 * in one pass and has no way to skip one file in the middle of that batch.
 * So: run `npm run db:migrate` first for everything up to (not including)
 * this migration, then this script for it, then `npm run db:migrate` again
 * for anything after it.
 */
async function main() {
  const tag = process.argv[2];
  if (!tag) {
    throw new Error(
      "Usage: npm run db:migrate-concurrent -- <migration_tag>\n" +
        "  e.g. npm run db:migrate-concurrent -- 0039_some_migration_tag",
    );
  }

  const journal = JSON.parse(
    readFileSync("db/migrations/meta/_journal.json", "utf8"),
  ) as { entries: { tag: string; when: number }[] };
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) {
    throw new Error(
      `No journal entry for tag "${tag}" in db/migrations/meta/_journal.json.`,
    );
  }

  const sqlPath = `db/migrations/${tag}.sql`;
  const rawSql = readFileSync(sqlPath, "utf8");
  if (!/CONCURRENTLY/i.test(rawSql)) {
    throw new Error(
      `${sqlPath} does not contain CONCURRENTLY — this script is only for migrations that must run outside a transaction. Use \`npm run db:migrate\` instead.`,
    );
  }
  const hash = createHash("sha256").update(rawSql).digest("hex");
  const statements = rawSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required. Set it in .env.local.");
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Same bookkeeping objects `drizzle-kit migrate` creates on its own
    // first run — safe to repeat, and required if this is ever run before
    // any normal migration has (not the expected order, but not fatal).
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const { rows } = await pool.query<{ exists: boolean }>(
      `select exists(select 1 from drizzle.__drizzle_migrations where hash = $1) as exists`,
      [hash],
    );
    if (rows[0]?.exists) {
      console.log(
        `${tag} is already recorded as applied (hash match). Nothing to do.`,
      );
      return;
    }

    console.log(
      `Applying ${sqlPath} directly, outside a transaction — ${statements.length} statement(s):`,
    );
    for (const [i, statement] of statements.entries()) {
      console.log(
        `  [${i + 1}/${statements.length}] ${statement.slice(0, 100)}`,
      );
      await pool.query(statement);
    }

    await pool.query(
      `insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)`,
      [hash, entry.when],
    );

    console.log(
      `Applied and recorded ${tag}. Run \`npm run db:verify\` to confirm zero drift.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
