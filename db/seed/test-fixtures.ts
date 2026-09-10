import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  grammarItems,
  idempotencyKeys,
  languages,
  learningItemSentences,
  learningItems,
  levels,
  sentences,
  userItemProgress,
  userLevelProgress,
  userNotes,
  users,
  userSynonyms,
  vocabularyGroups,
  vocabularyItems,
} from "@/db/schema";
import { getDefaultLanguageCode } from "@/domains/users";
import { normalizeForComparison } from "@/lib/answer-checking/normalize";

/**
 * Deterministic database fixtures (spec 08 §37, §38) — intentionally small
 * while exercising every table the schema defines. IDs are fixed literal
 * UUIDs so integration tests can reference specific rows without querying
 * for them first.
 *
 * `LANGUAGE_CODE`'s language is shared with the real application — it is the
 * language every real learner is provisioned into — so it is looked up
 * rather than assumed. Everything else here is the fixture's own.
 *
 * **The fixture curriculum lives in its own levels** (`FIXTURE_LEVEL_NUMBER`
 * and the one after it), not in the real Level 1 (user decision,
 * 2026-09-09). It used to share Level 1, and because three concurrency tests
 * commit their seed, running the integration suite wrote five demo words
 * into the real curriculum — which then broke four tests that asserted what
 * Level 1 contains, and quietly re-published demo items an admin had
 * archived. Levels 90/91 are numbers no real curriculum will reach and no
 * other test uses.
 *
 * `TestFixtureIds` still calls them `level1Id`/`level2Id`: they are this
 * fixture's first and second level, and renaming the keys would churn every
 * test that reads them without telling anyone anything new.
 */

/**
 * Deliberately far above any real level, and above the ad-hoc levels other
 * tests create (93-99 are taken).
 *
 * The ids below moved with them (2026-09-09). `LEVEL_2_ID` and
 * `VOCAB_GROUP_ID` used to be `…0002`/`…0001`, which were *also* the real
 * Level 2 and the real "Numbers" group — the seed's `onConflictDoNothing`
 * then silently left the fixture pointing into live curriculum. Separate ids
 * are what actually keeps the two apart; the level number alone did not.
 */
export const FIXTURE_LEVEL_NUMBER = 90;
export const FIXTURE_NEXT_LEVEL_NUMBER = 91;
export const LEVEL_1_ID = "20000000-0000-0000-0000-000000000001";

export const LEVEL_2_ID = "20000000-0000-0000-0000-000000000091";
export const VOCAB_GROUP_ID = "30000000-0000-0000-0000-000000000090";
export const ITEM_GATO_ID = "40000000-0000-0000-0000-000000000001";
export const ITEM_CASA_ID = "40000000-0000-0000-0000-000000000002";
export const ITEM_AGUA_ID = "40000000-0000-0000-0000-000000000003";
export const ITEM_Y_ID = "40000000-0000-0000-0000-000000000004";
export const ITEM_ROJO_ID = "40000000-0000-0000-0000-000000000005";
export const SENTENCE_GATO_ID = "50000000-0000-0000-0000-000000000001";
export const SENTENCE_Y_ID = "50000000-0000-0000-0000-000000000002";
export const LEARNER_ID = "60000000-0000-0000-0000-000000000001";
export const DEVELOPER_ID = "60000000-0000-0000-0000-000000000002";
export const SANDBOX_ID = "60000000-0000-0000-0000-000000000003";
export const IDEMPOTENCY_KEY_ID = "70000000-0000-0000-0000-000000000001";
export const IDEMPOTENCY_KEY_VALUE = "70000000-0000-0000-0000-000000000002";

export const LEARNER_CLERK_USER_ID = "fixture-clerk-learner";
export const DEVELOPER_CLERK_USER_ID = "fixture-clerk-developer";

export interface TestFixtureIds {
  languageId: string;
  level1Id: string;
  level2Id: string;
  vocabGroupId: string;
  gatoId: string;
  casaId: string;
  aguaId: string;
  grammarYId: string;
  rojoId: string;
  learnerId: string;
  developerId: string;
  sandboxId: string;
}

export type SeedTestFixturesOptions = {
  /**
   * Set by the handful of callers whose writes **commit** to the shared
   * dev/test database rather than being rolled back: `npm run db:seed` and
   * the three concurrency tests that need genuinely committed rows.
   *
   * With it, an existing row's curriculum status is left exactly as it is.
   * Without it (the normal, in-transaction case) the fixture re-asserts
   * `published` on its own items — see the `learningItems` upsert below for
   * why that is needed at all.
   */
  committed?: boolean;
};

export async function seedTestFixtures(db: DbClient, options: SeedTestFixturesOptions = {}): Promise<TestFixtureIds> {
  const languageCode = getDefaultLanguageCode();

  const [insertedLanguage] = await db
    .insert(languages)
    .values({ code: languageCode, slug: "spanish", name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning();
  const language =
    insertedLanguage ?? (await db.select().from(languages).where(eq(languages.code, languageCode)).limit(1))[0];
  const languageId = language.id;

  await db
    .insert(levels)
    .values({ id: LEVEL_1_ID, languageId, levelNumber: FIXTURE_LEVEL_NUMBER, name: "Fixture level", status: "published" })
    .onConflictDoNothing({ target: levels.id });
  const level1Id = LEVEL_1_ID;

  await db
    .insert(levels)
    .values({ id: LEVEL_2_ID, languageId, levelNumber: FIXTURE_NEXT_LEVEL_NUMBER, name: "Fixture level 2", status: "published" })
    .onConflictDoNothing({ target: levels.id });

  await db
    .insert(vocabularyGroups)
    .values({ id: VOCAB_GROUP_ID, levelId: level1Id, languageId, name: "Home & Basics", position: 1, status: "published" })
    .onConflictDoNothing({ target: vocabularyGroups.id });

  // Level 1 vocabulary: a plain noun, an article-requiring noun, and an
  // irregular-article noun — mirrors spec 07's fixture curriculum's
  // deliberate coverage, per §37's "exercising the actual schema" guidance.
  // `TEST_DATABASE_URL` points at the same database as `DATABASE_URL` (see
  // Environment Notes in progress-tracker.md), so these demo rows share a
  // database with the real curriculum — and the real Level 1 import (spec
  // 16) archived them there, deliberately. An in-transaction seed therefore
  // has to re-assert `published`, or every integration test would run
  // against archived items that no published-only read path can see; the
  // rollback keeps that scoped to the test.
  //
  // A *committing* caller must not do that. It would silently un-archive the
  // demo items in the real database and put them back in front of learners,
  // which is exactly what happened once before this option existed.
  const learningItemValues = [
    { id: ITEM_GATO_ID, languageId, levelId: level1Id, type: "vocabulary" as const, status: "published" as const, position: 1, lessonPriority: 1 },
    { id: ITEM_CASA_ID, languageId, levelId: level1Id, type: "vocabulary" as const, status: "published" as const, position: 2, lessonPriority: 2 },
    { id: ITEM_AGUA_ID, languageId, levelId: level1Id, type: "vocabulary" as const, status: "published" as const, position: 3, lessonPriority: 3 },
    { id: ITEM_Y_ID, languageId, levelId: level1Id, type: "grammar" as const, status: "published" as const, position: 4, lessonPriority: 4 },
    { id: ITEM_ROJO_ID, languageId, levelId: LEVEL_2_ID, type: "vocabulary" as const, status: "published" as const, position: 1, lessonPriority: 1 },
  ];
  const learningItemsInsert = db.insert(learningItems).values(learningItemValues);
  await (options.committed
    ? learningItemsInsert.onConflictDoNothing({ target: learningItems.id })
    : learningItemsInsert.onConflictDoUpdate({ target: learningItems.id, set: { status: "published" } }));

  await db
    .insert(vocabularyItems)
    .values([
      {
        learningItemId: ITEM_GATO_ID,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "gato",
        primaryMeaning: "cat",
        article: "el",
        partOfSpeech: "noun",
      },
      {
        learningItemId: ITEM_CASA_ID,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "casa",
        primaryMeaning: "house",
        article: "la",
        partOfSpeech: "noun",
      },
      {
        learningItemId: ITEM_AGUA_ID,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "agua",
        primaryMeaning: "water",
        // Irregular: feminine noun that takes "el" in the singular.
        article: "el",
        partOfSpeech: "noun",
        creatorNotes: "Irregular article: feminine noun, singular article 'el'.",
      },
      {
        learningItemId: ITEM_ROJO_ID,
        vocabularyGroupId: VOCAB_GROUP_ID,
        term: "rojo",
        primaryMeaning: "red",
        partOfSpeech: "adjective",
      },
    ])
    .onConflictDoNothing({ target: vocabularyItems.learningItemId });

  await db
    .insert(grammarItems)
    .values({
      learningItemId: ITEM_Y_ID,
      structure: "y",
      primaryMeaning: "and",
      explanation: "Connects two words, phrases, or clauses.",
      requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
    })
    .onConflictDoNothing({ target: grammarItems.learningItemId });

  await db
    .insert(sentences)
    .values([
      { id: SENTENCE_GATO_ID, languageId, targetText: "El gato duerme.", translation: "The cat sleeps.", status: "published" },
      { id: SENTENCE_Y_ID, languageId, targetText: "gato y perro", translation: "cat and dog", status: "published" },
    ])
    .onConflictDoNothing({ target: sentences.id });

  await db
    .insert(learningItemSentences)
    .values([
      { learningItemId: ITEM_GATO_ID, sentenceId: SENTENCE_GATO_ID, position: 1 },
      { learningItemId: ITEM_Y_ID, sentenceId: SENTENCE_Y_ID, position: 1 },
    ])
    .onConflictDoNothing({ target: [learningItemSentences.learningItemId, learningItemSentences.position] });

  await db
    .insert(users)
    .values([
      { id: LEARNER_ID, clerkUserId: LEARNER_CLERK_USER_ID, role: "user", activeLanguageId: languageId },
      { id: DEVELOPER_ID, clerkUserId: DEVELOPER_CLERK_USER_ID, role: "developer", activeLanguageId: languageId },
    ])
    .onConflictDoNothing({ target: users.id });

  await db
    .insert(users)
    .values({ id: SANDBOX_ID, isSandbox: true, sandboxOwnerUserId: DEVELOPER_ID, activeLanguageId: languageId })
    .onConflictDoNothing({ target: users.id });

  await db
    .insert(userLevelProgress)
    .values({ userId: LEARNER_ID, levelId: level1Id, unlockedAt: new Date() })
    .onConflictDoNothing({ target: [userLevelProgress.userId, userLevelProgress.levelId] });

  await db
    .insert(userItemProgress)
    .values({
      userId: LEARNER_ID,
      learningItemId: ITEM_GATO_ID,
      languageId,
      srsStage: "beginner_2",
      correctCount: 1,
      reviewCount: 1,
    })
    .onConflictDoNothing({ target: [userItemProgress.userId, userItemProgress.learningItemId] });

  await db
    .insert(userNotes)
    .values({ userId: LEARNER_ID, learningItemId: ITEM_GATO_ID, body: "Remember: el gato, not la gato." })
    .onConflictDoNothing({ target: [userNotes.userId, userNotes.learningItemId] });

  await db
    .insert(userSynonyms)
    .values({
      userId: LEARNER_ID,
      learningItemId: ITEM_GATO_ID,
      side: "meaning",
      value: "kitty",
      normalizedValue: normalizeForComparison("kitty"),
    })
    .onConflictDoNothing({
      target: [userSynonyms.userId, userSynonyms.learningItemId, userSynonyms.side, userSynonyms.normalizedValue],
    });

  await db
    .insert(idempotencyKeys)
    .values({
      id: IDEMPOTENCY_KEY_ID,
      userId: LEARNER_ID,
      operation: "lesson.complete",
      key: IDEMPOTENCY_KEY_VALUE,
      requestHash: "fixture-request-hash",
      status: "succeeded",
      responseSnapshot: { ok: true },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing({ target: idempotencyKeys.id });

  return {
    languageId,
    level1Id,
    level2Id: LEVEL_2_ID,
    vocabGroupId: VOCAB_GROUP_ID,
    gatoId: ITEM_GATO_ID,
    casaId: ITEM_CASA_ID,
    aguaId: ITEM_AGUA_ID,
    grammarYId: ITEM_Y_ID,
    rojoId: ITEM_ROJO_ID,
    learnerId: LEARNER_ID,
    developerId: DEVELOPER_ID,
    sandboxId: SANDBOX_ID,
  };
}
