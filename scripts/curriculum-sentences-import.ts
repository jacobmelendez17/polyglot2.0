import { config } from "dotenv";

// Runs as a standalone `tsx` CLI — load .env.local the same way
// scripts/curriculum-import.ts and db/seed/run.ts do, before anything else
// touches process.env.
config({ path: ".env.local" });

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, or } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import type { DbClient } from "@/db/client";
import * as schema from "@/db/schema";
import {
  grammarItems,
  learningItems,
  levels,
  users,
  vocabularyItems,
} from "@/db/schema";
import { mutateItemExample } from "@/domains/admin/publication-service";
import {
  getItemExamples,
  type ExampleRow,
} from "@/domains/curriculum/curriculum-mutation-repository";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * `npm run curriculum:sentences` — loads authored example sentences from a
 * CSV (word, position, target_text, translation) into the real database,
 * through the same audited `mutateItemExample` path the Admin item-detail
 * page's "Add example" form uses (spec 17). Not the bulk vocabulary import
 * path (`scripts/curriculum-import.ts`) — that creates words; this attaches
 * sentences to words that already exist.
 *
 * Matched to a word by (level, language, term-or-structure) — vocabulary is
 * matched by `vocabulary_items.term`, grammar by `grammar_items.structure`,
 * whichever the row's `word` resolves to. `position` is authoring order
 * only, used for readable warnings; display order comes from
 * `mutateItemExample`'s own append-at-end behavior, same as the Admin UI.
 *
 * Idempotent two ways: `mutateItemExample`'s own `idempotencyKey` (derived
 * from the file's content hash + word + position, so a byte-identical
 * re-run replays rather than re-creates), and a pre-check against the
 * word's existing examples by exact `target_text` match, which also skips a
 * sentence that was authored by hand before this script ever ran (spec 17's
 * `cero` example, added from Admin, is exactly this case).
 *
 * Usage:
 *   npm run curriculum:sentences -- --actor <user id | Clerk id> --dry-run
 *   npm run curriculum:sentences -- --actor <user id | Clerk id>
 *   npm run curriculum:sentences -- --file content/curriculum/spanish-level-1.sentences.csv --actor <id>
 */

const DEFAULT_CSV_PATH = "content/curriculum/spanish-level-1.sentences.csv";
const DEFAULT_LANGUAGE_CODE = "es-MX";
const DEFAULT_LEVEL_NUMBER = 1;

const rowSchema = z.object({
  word: z.string().min(1),
  position: z.string().min(1),
  target_text: z.string().min(1),
  translation: z.string().min(1),
});

type SentenceRow = z.infer<typeof rowSchema>;

type CliOptions = {
  csvPath: string;
  languageCode: string;
  levelNumber: number;
  actor: string | null;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    csvPath: DEFAULT_CSV_PATH,
    languageCode: DEFAULT_LANGUAGE_CODE,
    levelNumber: DEFAULT_LEVEL_NUMBER,
    actor: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
        options.csvPath = argv[++i] ?? options.csvPath;
        break;
      case "--language":
        options.languageCode = argv[++i] ?? options.languageCode;
        break;
      case "--level":
        options.levelNumber = Number(argv[++i] ?? options.levelNumber);
        break;
      case "--actor":
        options.actor = argv[++i] ?? null;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        throw new Error(
          `Unknown argument "${arg}". See the usage block in scripts/curriculum-sentences-import.ts.`,
        );
    }
  }

  return options;
}

/** Same pattern as `scripts/curriculum-import.ts`'s `stepKey` — a stable v4-shaped UUID from a readable string, since `idempotency_keys.key` is a real `uuid` column. */
function stepKey(namespace: string, step: string): string {
  const digest = createHash("sha256").update(`${namespace}:${step}`).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identical requirement and logic to `scripts/curriculum-import.ts`'s `resolveActor` — every write here is a real, audited admin mutation, so it is never attributed to a guessed user. */
async function resolveActor(
  db: DbClient,
  requested: string | null,
): Promise<{ id: string; role: string }> {
  const privileged = await db
    .select({ id: users.id, role: users.role, clerkUserId: users.clerkUserId })
    .from(users)
    .where(or(eq(users.role, "admin"), eq(users.role, "developer")));

  if (requested) {
    const match = privileged.find(
      (user) => user.id === requested || user.clerkUserId === requested,
    );
    if (!match) {
      throw new Error(
        `No admin or developer user matches "${requested}" (matched against both the internal user id and the Clerk user id). ` +
          `Privileged users currently in this database: ${privileged.length === 0 ? "none" : privileged.map((u) => `${u.id} (${u.role})`).join(", ")}.`,
      );
    }
    return { id: match.id, role: match.role };
  }

  if (privileged.length === 1)
    return { id: privileged[0]!.id, role: privileged[0]!.role };

  throw new Error(
    privileged.length === 0
      ? "This database has no admin or developer user to attribute the import to. Elevate an account's `users.role` first, then re-run with --actor <user id>."
      : `Several admin/developer users exist — pass --actor explicitly. Candidates: ${privileged.map((u) => `${u.id} (${u.role})`).join(", ")}.`,
  );
}

/** Resolves a CSV `word` to the learning item it names — vocabulary's `term` or grammar's `structure`, whichever matches, scoped to one level+language so a Level 2 homonym never collides. */
async function resolveWordToItem(
  db: DbClient,
  {
    word,
    levelId,
    languageId,
  }: { word: string; levelId: string; languageId: string },
): Promise<{ learningItemId: string; type: "vocabulary" | "grammar" } | null> {
  const [vocabRow] = await db
    .select({ learningItemId: vocabularyItems.learningItemId })
    .from(vocabularyItems)
    .innerJoin(
      learningItems,
      eq(learningItems.id, vocabularyItems.learningItemId),
    )
    .where(
      and(
        eq(vocabularyItems.term, word),
        eq(learningItems.levelId, levelId),
        eq(learningItems.languageId, languageId),
      ),
    )
    .limit(1);
  if (vocabRow) return { learningItemId: vocabRow.learningItemId, type: "vocabulary" };

  const [grammarRow] = await db
    .select({ learningItemId: grammarItems.learningItemId })
    .from(grammarItems)
    .innerJoin(
      learningItems,
      eq(learningItems.id, grammarItems.learningItemId),
    )
    .where(
      and(
        eq(grammarItems.structure, word),
        eq(learningItems.levelId, levelId),
        eq(learningItems.languageId, languageId),
      ),
    )
    .limit(1);
  if (grammarRow)
    return { learningItemId: grammarRow.learningItemId, type: "grammar" };

  return null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required. Set it in .env.local.");

  const csvPath = resolve(process.cwd(), options.csvPath);
  const csvContent = readFileSync(csvPath, "utf8");
  const contentHash = createHash("sha256")
    .update(csvContent)
    .digest("hex")
    .slice(0, 16);
  const keyPrefix = `curriculum-sentences:${options.languageCode}:level-${options.levelNumber}:${contentHash}`;

  const records = parse(csvContent, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  const rows: SentenceRow[] = records.map((record, index) => {
    const result = rowSchema.safeParse(record);
    if (!result.success)
      throw new Error(
        `Row ${index + 2} of ${options.csvPath} is invalid: ${result.error.issues.map((i) => i.message).join(", ")}`,
      );
    return result.data;
  });

  console.log(
    `Sentence import — ${options.csvPath} (${contentHash}), ${rows.length} rows`,
  );

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });

    const [language] = await db
      .select({ id: schema.languages.id })
      .from(schema.languages)
      .where(eq(schema.languages.code, options.languageCode))
      .limit(1);
    if (!language)
      throw new Error(
        `Language "${options.languageCode}" does not exist in this database.`,
      );

    const [level] = await db
      .select({ id: levels.id })
      .from(levels)
      .where(
        and(
          eq(levels.languageId, language.id),
          eq(levels.levelNumber, options.levelNumber),
        ),
      )
      .limit(1);
    if (!level)
      throw new Error(
        `Level ${options.levelNumber} does not exist for language "${options.languageCode}".`,
      );

    const actor = await resolveActor(db, options.actor);
    console.log(`  actor: ${actor.id} (${actor.role})`);

    const itemCache = new Map<
      string,
      { learningItemId: string; type: "vocabulary" | "grammar" } | null
    >();
    const examplesCache = new Map<
      string,
      Awaited<ReturnType<typeof getItemExamples>>
    >();

    let created = 0;
    let skippedDuplicate = 0;
    let skippedNotFound = 0;

    for (const row of rows) {
      let item = itemCache.get(row.word);
      if (item === undefined) {
        item = await resolveWordToItem(db, {
          word: row.word,
          levelId: level.id,
          languageId: language.id,
        });
        itemCache.set(row.word, item);
      }
      if (!item) {
        console.warn(
          `  ! row (word "${row.word}", position ${row.position}) skipped: no vocabulary or grammar item named "${row.word}" in Level ${options.levelNumber}.`,
        );
        skippedNotFound += 1;
        continue;
      }

      let existing = examplesCache.get(item.learningItemId);
      if (!existing) {
        existing = await getItemExamples(db, item.learningItemId);
        examplesCache.set(item.learningItemId, existing);
      }
      const duplicate = existing.some(
        (example: ExampleRow) =>
          normalize(example.targetText) === normalize(row.target_text),
      );
      if (duplicate) {
        console.log(
          `  = "${row.word}" #${row.position}: identical sentence already attached — skipped.`,
        );
        skippedDuplicate += 1;
        continue;
      }

      if (options.dryRun) {
        console.log(
          `  + "${row.word}" #${row.position} would be created: ${row.target_text}`,
        );
        created += 1;
        continue;
      }

      const { exampleId } = await mutateItemExample(db, {
        learningItemId: item.learningItemId,
        actorUserId: actor.id,
        idempotencyKey: stepKey(keyPrefix, `${row.word}:${row.position}`),
        mutation: {
          kind: "create",
          targetText: row.target_text,
          translation: row.translation,
        },
      });
      // A cached duplicate-list is now stale for this item — the next row
      // for the same word must not compare against it and think its own
      // freshly created sentence is a pre-existing duplicate of itself.
      existing.push({
        id: exampleId ?? "",
        sentenceId: "",
        usageContextId: null,
        position: existing.length + 1,
        targetText: row.target_text,
        translation: row.translation,
      });
      created += 1;
    }

    console.log(
      `${options.dryRun ? "Dry run: " : ""}${created} sentence(s) ${options.dryRun ? "would be " : ""}created; ${skippedDuplicate} already present; ${skippedNotFound} word(s) not found.`,
    );
    if (options.dryRun) console.log("Nothing was written.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof AdminError) {
    console.error(`Import failed (${error.code}): ${error.message}`);
  } else {
    console.error("Import failed:", error);
  }
  process.exitCode = 1;
});
