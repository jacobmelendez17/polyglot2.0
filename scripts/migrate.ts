import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

import { MigrationError, runMigrations } from "@/db/migrate/run-migrations";

// Runs as a standalone `tsx` CLI, outside Next.js's env loading — load
// .env.local the same way drizzle.config.ts does. A missing file is fine:
// CI and Vercel provide DATABASE_URL directly (and set variables always win
// over the file).
config({ path: ".env.local", quiet: true });

/**
 * `npm run db:migrate` — applies every pending migration in
 * `db/migrations` to `DATABASE_URL`, one transaction per migration (see
 * db/migrate/run-migrations.ts for why this replaced `drizzle-kit migrate`).
 * Forward-only: it never rolls back a migration that has committed.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to run migrations. Set it in .env.local — see .env.example.",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const { applied, alreadyApplied } = await runMigrations(pool, {
      migrationsFolder: "./db/migrations",
      log: console.log,
    });
    console.log(
      applied.length === 0
        ? `Database is up to date (${alreadyApplied} migrations already applied).`
        : `Applied ${applied.length} migration(s); ${alreadyApplied} were already applied.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof MigrationError ? error.message : error);
  process.exitCode = 1;
});
