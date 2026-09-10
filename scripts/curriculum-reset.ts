import { config } from "dotenv";

// Runs as a standalone `tsx` CLI, outside Next.js's own env loading — load
// .env.local the same way `db/seed/run.ts` and the other scripts do.
config({ path: ".env.local" });

import { createInterface } from "node:readline/promises";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, inArray } from "drizzle-orm";

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
  sentences,
  userItemProgress,
  userNotes,
  userSynonyms,
  vocabularyDictionaryMappings,
  vocabularyItems,
  vocabularySelectedSenses,
} from "@/db/schema";

/**
 * `npm run curriculum:reset` — deletes every learning item in one language,
 * whatever its status, so an authored curriculum can be re-imported from
 * scratch (user request, 2026-09-09: "it got too messy and I'd like to
 * reset").
 *
 * **This is destructive and cannot be undone**, so it refuses to run without
 * `--confirm` and prints exactly what it is about to delete first.
 *
 * Levels and vocabulary groups are deliberately *kept*: they are the
 * structure a re-import fills, and the application cannot provision a new
 * user without a Level 1 existing. Pass `--groups` to drop the vocabulary
 * groups too; the import manifest recreates them by name.
 *
 * Deleting curriculum means deleting everything that points at it. Those
 * foreign keys are `RESTRICT` precisely so this cannot happen by accident —
 * learner progress, notes, synonyms, review history, deck membership, and
 * dictionary mappings all go with the items. The dictionary itself
 * (`dictionary_entries` and everything under it) is untouched: it is
 * expensive to import and independent of curriculum.
 */

type Options = { languageCode: string; confirm: boolean; includeGroups: boolean };

function parseArgs(argv: string[]): Options {
  const options: Options = { languageCode: "es-MX", confirm: false, includeGroups: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--language":
        options.languageCode = argv[++i] ?? options.languageCode;
        break;
      case "--confirm":
        options.confirm = true;
        break;
      case "--groups":
        options.includeGroups = true;
        break;
      default:
        throw new Error(`Unknown argument "${argv[i]}". See the usage block in scripts/curriculum-reset.ts.`);
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required. Set it in .env.local.");

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });

    const [language] = await db.select({ id: languages.id }).from(languages).where(eq(languages.code, options.languageCode)).limit(1);
    if (!language) throw new Error(`Language "${options.languageCode}" does not exist in this database.`);

    const items = await db
      .select({ id: learningItems.id, type: learningItems.type, status: learningItems.status })
      .from(learningItems)
      .where(eq(learningItems.languageId, language.id));

    if (items.length === 0) {
      console.log(`Nothing to delete — ${options.languageCode} has no learning items.`);
      return;
    }

    const itemIds = items.map((item) => item.id);
    const byStatus = items.reduce<Record<string, number>>((counts, item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      return counts;
    }, {});

    console.log(`About to permanently delete ${items.length} learning item(s) from ${options.languageCode}:`);
    console.log(`  by status: ${Object.entries(byStatus).map(([status, count]) => `${status}=${count}`).join(", ")}`);
    console.log("  and everything referencing them: progress, notes, synonyms, review history, deck membership, dictionary mappings.");
    console.log(options.includeGroups ? "  vocabulary groups: also deleted" : "  vocabulary groups: kept");
    console.log("  levels: kept · dictionary entries: untouched");

    if (!options.confirm) {
      console.log("\nRe-run with --confirm to actually do it. Nothing was deleted.");
      return;
    }

    // A second, interactive gate when someone is watching: `--confirm` alone
    // is enough for a non-interactive run, but a human at a terminal gets one
    // last chance to read the counts above.
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`\nType the language code (${options.languageCode}) to confirm: `);
      rl.close();
      if (answer.trim() !== options.languageCode) {
        console.log("Confirmation did not match. Nothing was deleted.");
        return;
      }
    }

    await db.transaction(async (tx) => {
      // Order matters: every dependent row first, deepest first, then the
      // items themselves. Each of these is an `ON DELETE RESTRICT` reference
      // that would otherwise block the delete.
      await tx.delete(vocabularySelectedSenses).where(inArray(vocabularySelectedSenses.vocabularyItemId, itemIds));
      await tx.delete(vocabularyDictionaryMappings).where(inArray(vocabularyDictionaryMappings.vocabularyItemId, itemIds));
      await tx.delete(reviewEvents).where(inArray(reviewEvents.learningItemId, itemIds));
      await tx.delete(userItemProgress).where(inArray(userItemProgress.learningItemId, itemIds));
      await tx.delete(userNotes).where(inArray(userNotes.learningItemId, itemIds));
      await tx.delete(userSynonyms).where(inArray(userSynonyms.learningItemId, itemIds));
      await tx.delete(deckItems).where(inArray(deckItems.learningItemId, itemIds));
      await tx.delete(curriculumItemDrafts).where(inArray(curriculumItemDrafts.learningItemId, itemIds));
      await tx.delete(learningItemSentences).where(inArray(learningItemSentences.learningItemId, itemIds));
      await tx.delete(acceptedAnswers).where(inArray(acceptedAnswers.learningItemId, itemIds));
      await tx.delete(vocabularyItems).where(inArray(vocabularyItems.learningItemId, itemIds));
      await tx.delete(grammarItems).where(inArray(grammarItems.learningItemId, itemIds));
      await tx.delete(learningItems).where(inArray(learningItems.id, itemIds));

      // Example sentences are language-scoped rather than item-scoped, and
      // nothing references them once the join rows above are gone.
      await tx.delete(sentences).where(eq(sentences.languageId, language.id));

      if (options.includeGroups) {
        await tx.delete(schema.vocabularyGroups).where(eq(schema.vocabularyGroups.languageId, language.id));
      }
    });

    const remaining = await db.select({ id: learningItems.id }).from(learningItems).where(eq(learningItems.languageId, language.id));
    const remainingLevels = await db.select({ id: levels.id }).from(levels).where(eq(levels.languageId, language.id));
    console.log(`\nDeleted. ${remaining.length} learning item(s) remain; ${remainingLevels.length} level(s) kept.`);
    console.log("Re-import with: npm run curriculum:import -- --actor <admin user id>");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Reset failed:", error);
  process.exitCode = 1;
});
