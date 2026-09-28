import { config } from "dotenv";

// Runs as a standalone `tsx` CLI, outside Next.js's own env loading — load
// .env.local the same way the other scripts in this directory do.
config({ path: ".env.local" });

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, isNull, sql } from "drizzle-orm";

import * as schema from "@/db/schema";
import {
  languages,
  learningItems,
  levels,
  vocabularyGroups,
} from "@/db/schema";
import {
  CURRICULUM_KEY_SEGMENT_BY_ITEM_TYPE,
  withGeneratedCurriculumKey,
} from "@/domains/curriculum/curriculum-key-service";

/**
 * One-time backfill for spec 25 Unit 1's curriculum keys (`npm run
 * curriculum-keys:backfill`), run once against real data between migrations
 * `0042_add_curriculum_key_columns` (adds the nullable column) and
 * `0044_add_curriculum_key_not_null` (makes it `NOT NULL`) — after
 * `0043_add_curriculum_key_unique_indexes` (the concurrent unique index) has
 * already been applied via `npm run db:migrate-concurrent`, so a genuine
 * collision is caught by the database, not silently allowed through:
 *
 *   npm run db:migrate                                        (0042)
 *   npm run db:migrate-concurrent -- 0043_add_curriculum_key_unique_indexes
 *   npm run curriculum-keys:backfill                          (this script)
 *   npm run db:migrate                                        (0044)
 *
 * Every existing Level, vocabulary group, vocabulary item, and grammar item
 * that predates this feature gets exactly one permanent key, generated the
 * same way — and in the same format — a brand-new one would get going
 * forward (`domains/curriculum/curriculum-key-service.ts`). This never
 * touches `id`, status, position, or any other column — spec 25 §4's
 * migration-verification requirement ("no learning_item.id changes, no
 * progress/review/deck reference breaks") holds by construction, since the
 * only statement this script ever issues is `UPDATE ... SET curriculum_key`.
 *
 * Batched and resumable: each table is processed in pages of rows still
 * missing a key, re-querying after each page, so a script restarted after a
 * partial run (or interrupted for any reason) picks up exactly where it left
 * off rather than re-processing already-backfilled rows or requiring a single
 * unbounded update.
 */

const BATCH_SIZE = 500;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required. Set it in .env.local.");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  const levelsUpdated = await backfillLevels(db);
  console.log(`levels: backfilled ${levelsUpdated} row(s).`);

  const groupsUpdated = await backfillVocabularyGroups(db);
  console.log(`vocabulary_groups: backfilled ${groupsUpdated} row(s).`);

  const itemsUpdated = await backfillLearningItems(db);
  console.log(`learning_items: backfilled ${itemsUpdated} row(s).`);

  console.log(
    `Done. ${levelsUpdated + groupsUpdated + itemsUpdated} row(s) total.`,
  );
  await pool.end();
}

type Db = ReturnType<typeof drizzle<typeof schema>>;

async function backfillLevels(db: Db): Promise<number> {
  let totalUpdated = 0;
  for (;;) {
    const rows = await db
      .select({
        id: levels.id,
        languageCode: languages.code,
      })
      .from(levels)
      .innerJoin(languages, eq(levels.languageId, languages.id))
      .where(isNull(levels.curriculumKey))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      await withGeneratedCurriculumKey(
        row.languageCode,
        "level",
        "levels_curriculum_key_key",
        (curriculumKey) =>
          db
            .update(levels)
            .set({ curriculumKey })
            .where(
              sql`${levels.id} = ${row.id} and ${levels.curriculumKey} is null`,
            ),
      );
      totalUpdated += 1;
    }
  }
  return totalUpdated;
}

async function backfillVocabularyGroups(db: Db): Promise<number> {
  let totalUpdated = 0;
  for (;;) {
    const rows = await db
      .select({
        id: vocabularyGroups.id,
        languageCode: languages.code,
      })
      .from(vocabularyGroups)
      .innerJoin(languages, eq(vocabularyGroups.languageId, languages.id))
      .where(isNull(vocabularyGroups.curriculumKey))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      await withGeneratedCurriculumKey(
        row.languageCode,
        "group",
        "vocabulary_groups_curriculum_key_key",
        (curriculumKey) =>
          db
            .update(vocabularyGroups)
            .set({ curriculumKey })
            .where(
              sql`${vocabularyGroups.id} = ${row.id} and ${vocabularyGroups.curriculumKey} is null`,
            ),
      );
      totalUpdated += 1;
    }
  }
  return totalUpdated;
}

async function backfillLearningItems(db: Db): Promise<number> {
  let totalUpdated = 0;
  for (;;) {
    const rows = await db
      .select({
        id: learningItems.id,
        languageCode: languages.code,
        type: learningItems.type,
      })
      .from(learningItems)
      .innerJoin(languages, eq(learningItems.languageId, languages.id))
      .where(isNull(learningItems.curriculumKey))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      const segment = CURRICULUM_KEY_SEGMENT_BY_ITEM_TYPE[row.type];
      await withGeneratedCurriculumKey(
        row.languageCode,
        segment,
        "learning_items_curriculum_key_key",
        (curriculumKey) =>
          db
            .update(learningItems)
            .set({ curriculumKey })
            .where(
              sql`${learningItems.id} = ${row.id} and ${learningItems.curriculumKey} is null`,
            ),
      );
      totalUpdated += 1;
    }
  }
  return totalUpdated;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
