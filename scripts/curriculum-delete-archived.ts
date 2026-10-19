import { config } from "dotenv";

// Runs as a standalone `tsx` CLI, outside Next.js's own env loading — load
// .env.local the same way `curriculum-reset.ts` does. A `DATABASE_URL` already
// set in the shell wins over the file, which is how this is pointed at
// production without editing any file.
config({ path: ".env.local" });

import { createInterface } from "node:readline/promises";

import { Pool } from "@neondatabase/serverless";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";
import {
  acceptedAnswers,
  curriculumItemDrafts,
  deckItems,
  grammarItems,
  languages,
  learningItemSentences,
  learningItems,
  levels,
  reviewEvents,
  userItemProgress,
  userNotes,
  userSynonyms,
  vocabularyDictionaryMappings,
  vocabularyItems,
  vocabularySelectedSenses,
} from "@/db/schema";

/**
 * `npm run curriculum:delete-archived -- --level 2 --expect 59` — permanently
 * deletes the **archived** learning items of one level in one language, and
 * nothing else (owner request, 2026-10-19: the archived Level 2 words of an
 * import they did not like, which blocked re-importing the same spellings and
 * could not be restored in the Admin console).
 *
 * Narrower than `curriculum-reset.ts` on purpose: published and pending items,
 * other levels, vocabulary groups, the level itself and every example sentence
 * are left alone (sentences are language-scoped and may be shared).
 *
 * **Destructive and not undoable.** It prints what it would delete and stops
 * unless `--confirm` is passed; `--expect <n>` refuses to run when the number
 * of matching items differs, so a wrong database or a wrong level cannot
 * quietly delete a different set than the one you looked at. It prints the
 * database host (never the credentials) so a production run is recognisable.
 *
 * The delete runs in one transaction: if any other table still references an
 * item, the whole thing rolls back and nothing is removed.
 */

type Options = {
  languageCode: string;
  levelNumber: number | null;
  expect: number | null;
  confirm: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    languageCode: "es-MX",
    levelNumber: null,
    expect: null,
    confirm: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--language":
        options.languageCode = argv[++i] ?? options.languageCode;
        break;
      case "--level":
        options.levelNumber = Number.parseInt(argv[++i] ?? "", 10);
        break;
      case "--expect":
        options.expect = Number.parseInt(argv[++i] ?? "", 10);
        break;
      case "--confirm":
        options.confirm = true;
        break;
      default:
        throw new Error(
          `Unknown argument "${argv[i]}". See the usage block in scripts/curriculum-delete-archived.ts.`,
        );
    }
  }
  if (options.levelNumber === null || Number.isNaN(options.levelNumber)) {
    throw new Error("--level <number> is required.");
  }
  if (options.expect !== null && Number.isNaN(options.expect)) {
    throw new Error("--expect needs a number.");
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const levelNumber = options.levelNumber as number;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  console.log(`Database host: ${new URL(databaseUrl).host}`);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });

    const [language] = await db
      .select({ id: languages.id })
      .from(languages)
      .where(eq(languages.code, options.languageCode))
      .limit(1);
    if (!language) {
      throw new Error(
        `Language "${options.languageCode}" does not exist in this database.`,
      );
    }

    const [level] = await db
      .select({ id: levels.id })
      .from(levels)
      .where(
        and(
          eq(levels.languageId, language.id),
          eq(levels.levelNumber, levelNumber),
        ),
      )
      .limit(1);
    if (!level) {
      throw new Error(
        `${options.languageCode} has no Level ${levelNumber} in this database.`,
      );
    }

    const items = await db
      .select({
        id: learningItems.id,
        type: learningItems.type,
        curriculumKey: learningItems.curriculumKey,
        term: vocabularyItems.term,
      })
      .from(learningItems)
      .leftJoin(
        vocabularyItems,
        eq(vocabularyItems.learningItemId, learningItems.id),
      )
      .where(
        and(
          eq(learningItems.languageId, language.id),
          eq(learningItems.levelId, level.id),
          eq(learningItems.status, "archived"),
        ),
      );

    if (items.length === 0) {
      console.log(
        `Nothing to delete — no archived items in ${options.languageCode} Level ${levelNumber}.`,
      );
      return;
    }

    console.log(
      `\nArchived items in ${options.languageCode} Level ${levelNumber}: ${items.length}`,
    );
    for (const item of items) {
      console.log(
        `  ${item.type.padEnd(10)} ${item.term ?? "—"}  (${item.curriculumKey})`,
      );
    }
    console.log(
      "\nWould also delete what references them: progress, notes, synonyms, review history, deck membership, dictionary mappings.",
    );
    console.log(
      "Kept: published/pending items, other levels, vocabulary groups, the level, example sentences.",
    );

    if (options.expect !== null && items.length !== options.expect) {
      throw new Error(
        `Expected ${options.expect} items but found ${items.length}. Nothing was deleted — check the language, level and database.`,
      );
    }

    if (!options.confirm) {
      console.log(
        "\nRe-run with --confirm to actually do it. Nothing was deleted.",
      );
      return;
    }

    if (process.stdin.isTTY) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await rl.question(
        `\nType DELETE ${items.length} to confirm: `,
      );
      rl.close();
      if (answer.trim() !== `DELETE ${items.length}`) {
        console.log("Confirmation did not match. Nothing was deleted.");
        return;
      }
    }

    const itemIds = items.map((item) => item.id);
    await db.transaction(async (tx) => {
      // Same dependency order as `curriculum-reset.ts`: dependents first.
      await tx
        .delete(vocabularySelectedSenses)
        .where(inArray(vocabularySelectedSenses.vocabularyItemId, itemIds));
      await tx
        .delete(vocabularyDictionaryMappings)
        .where(inArray(vocabularyDictionaryMappings.vocabularyItemId, itemIds));
      await tx
        .delete(reviewEvents)
        .where(inArray(reviewEvents.learningItemId, itemIds));
      await tx
        .delete(userItemProgress)
        .where(inArray(userItemProgress.learningItemId, itemIds));
      await tx
        .delete(userNotes)
        .where(inArray(userNotes.learningItemId, itemIds));
      await tx
        .delete(userSynonyms)
        .where(inArray(userSynonyms.learningItemId, itemIds));
      await tx
        .delete(deckItems)
        .where(inArray(deckItems.learningItemId, itemIds));
      await tx
        .delete(curriculumItemDrafts)
        .where(inArray(curriculumItemDrafts.learningItemId, itemIds));
      await tx
        .delete(learningItemSentences)
        .where(inArray(learningItemSentences.learningItemId, itemIds));
      await tx
        .delete(acceptedAnswers)
        .where(inArray(acceptedAnswers.learningItemId, itemIds));
      await tx
        .delete(vocabularyItems)
        .where(inArray(vocabularyItems.learningItemId, itemIds));
      await tx
        .delete(grammarItems)
        .where(inArray(grammarItems.learningItemId, itemIds));
      await tx.delete(learningItems).where(inArray(learningItems.id, itemIds));
    });

    const remaining = await db
      .select({ id: learningItems.id })
      .from(learningItems)
      .where(
        and(
          eq(learningItems.levelId, level.id),
          eq(learningItems.status, "archived"),
        ),
      );
    console.log(
      `\nDeleted ${items.length} archived item(s). ${remaining.length} archived item(s) remain in Level ${levelNumber}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Delete failed:", error);
  process.exitCode = 1;
});
