import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";

import {
  exportCurriculumSnapshot,
  summarizeSnapshot,
} from "@/db/snapshot/curriculum-snapshot";

// Runs as a standalone `tsx` CLI, outside Next.js's env loading — same
// pattern as the other scripts in this directory.
config({ path: ".env.local", quiet: true });

/**
 * `npm run curriculum:snapshot-export -- --language es-MX --level 1 [--out file]`
 *
 * Reads DATABASE_URL (the SOURCE, normally dev) inside a READ ONLY
 * transaction and writes one level's published curriculum to a JSON file
 * that `curriculum:snapshot-load` can insert into another database. It never
 * writes to the database. See db/snapshot/curriculum-snapshot.ts for what is
 * and is not included.
 *
 * The default output directory (`content/snapshots/`) is gitignored on
 * purpose: the repository is public, and a snapshot is the full authored
 * curriculum.
 */

type CliOptions = { languageCode: string; levelNumber: number; out: string };

function parseArgs(argv: string[]): CliOptions {
  let languageCode: string | undefined;
  let levelNumber: number | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--language":
        languageCode = argv[++i];
        break;
      case "--level":
        levelNumber = Number(argv[++i]);
        break;
      case "--out":
        out = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument "${argv[i]}".`);
    }
  }
  if (!languageCode || !levelNumber || !Number.isInteger(levelNumber)) {
    throw new Error(
      "Usage: npm run curriculum:snapshot-export -- --language es-MX --level 1 [--out file]",
    );
  }
  return {
    languageCode,
    levelNumber,
    out:
      out ??
      `content/snapshots/${languageCode}-level-${levelNumber}.snapshot.json`,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required (the source database). Set it in .env.local.",
    );
  }
  console.log(`Source database host: ${new URL(databaseUrl).host}`);

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const snapshot = await exportCurriculumSnapshot(client, options);
    await client.query("COMMIT");

    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(
      `Wrote ${options.languageCode} Level ${options.levelNumber} to ${options.out}`,
    );
    for (const line of summarizeSnapshot(snapshot)) console.log(`  ${line}`);
    console.log(
      "Keep this file out of git (content/snapshots/ is gitignored); the repository is public.",
    );
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
