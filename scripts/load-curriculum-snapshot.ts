import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

import {
  loadCurriculumSnapshot,
  parseSnapshot,
  summarizeSnapshot,
} from "@/db/snapshot/curriculum-snapshot";

// Runs as a standalone `tsx` CLI, outside Next.js's env loading. A variable
// already set in the environment always wins over .env.local, which is how a
// one-off run is pointed at another database without editing any file.
config({ path: ".env.local", quiet: true });

/**
 * `npm run curriculum:snapshot-load -- --file <snapshot.json> [--dry-run] [--yes]`
 *
 * Inserts a snapshot into DATABASE_URL (the TARGET) in ONE transaction.
 * `--dry-run` does everything, verifies it, and rolls back. Without `--yes`
 * it shows the target host and asks you to type "yes" first.
 *
 * It refuses any target that already has curriculum for the snapshot's
 * language, except a re-run of the very same snapshot, which does nothing.
 * It cannot overwrite or merge. See db/snapshot/curriculum-snapshot.ts.
 */

type CliOptions = { file: string; dryRun: boolean; yes: boolean };

function parseArgs(argv: string[]): CliOptions {
  let file: string | undefined;
  let dryRun = false;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--file":
        file = argv[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--yes":
        yes = true;
        break;
      default:
        throw new Error(`Unknown argument "${argv[i]}".`);
    }
  }
  if (!file) {
    throw new Error(
      "Usage: npm run curriculum:snapshot-load -- --file <snapshot.json> [--dry-run] [--yes]",
    );
  }
  return { file, dryRun, yes };
}

async function confirm(host: string): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Not an interactive terminal: pass --yes to confirm, or --dry-run to rehearse.",
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Load into ${host} ? (type yes): `);
    if (answer.trim() !== "yes")
      throw new Error("Cancelled. Nothing was changed.");
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required (the target database). Set it in .env.local or the environment.",
    );
  }
  const host = new URL(databaseUrl).host;

  const snapshot = parseSnapshot(
    JSON.parse(readFileSync(options.file, "utf8")),
  );
  console.log(
    `Snapshot: ${snapshot.language.code} Level ${snapshot.levelNumber}, exported ${snapshot.exportedAt}`,
  );
  for (const line of summarizeSnapshot(snapshot)) console.log(`  ${line}`);
  console.log(
    `Target database host: ${host}${options.dryRun ? "  (dry run)" : ""}`,
  );

  if (!options.dryRun && !options.yes) await confirm(host);

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await loadCurriculumSnapshot(client, snapshot, {
      log: console.log,
    });
    if (result.status === "already-loaded") {
      await client.query("ROLLBACK");
      console.log("This snapshot is already fully loaded. Nothing to do.");
    } else if (options.dryRun) {
      await client.query("ROLLBACK");
      console.log(
        "Dry run succeeded and was rolled back. Nothing was changed.",
      );
    } else {
      await client.query("COMMIT");
      console.log("Loaded and committed.");
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
