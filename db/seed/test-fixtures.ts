import { and, eq } from "drizzle-orm";

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
 * `LANGUAGE_CODE`'s language and its Level 1 are the one exception: spec 08
 * unit 3's concurrency integration test already committed real rows for
 * that exact code/level-number combination directly against the shared
 * dev/test Neon branch (deliberately, as the real provisioning fixture —
 * see progress-tracker.md). `seedTestFixtures` looks those up rather than
 * assuming its own IDs for them, so it stays correct whether it's the first
 * or the hundredth thing to seed this database. Every other row here has
 * never been touched by anything else, so a plain deterministic-ID insert
 * with `onConflictDoNothing` is sufficient for idempotent reruns.
 */

export const LEVEL_2_ID = "20000000-0000-0000-0000-000000000002";
export const VOCAB_GROUP_ID = "30000000-0000-0000-0000-000000000001";
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

export async function seedTestFixtures(db: DbClient): Promise<TestFixtureIds> {
  const languageCode = getDefaultLanguageCode();

  const [insertedLanguage] = await db
    .insert(languages)
    .values({ code: languageCode, slug: "spanish", name: "Spanish" })
    .onConflictDoNothing({ target: languages.code })
    .returning();
  const language =
    insertedLanguage ?? (await db.select().from(languages).where(eq(languages.code, languageCode)).limit(1))[0];
  const languageId = language.id;

  const [insertedLevel1] = await db
    .insert(levels)
    .values({ languageId, levelNumber: 1, name: "Level 1", status: "published" })
    .onConflictDoNothing({ target: [levels.languageId, levels.levelNumber] })
    .returning();
  const level1 =
    insertedLevel1 ??
    (
      await db
        .select()
        .from(levels)
        .where(and(eq(levels.languageId, languageId), eq(levels.levelNumber, 1)))
        .limit(1)
    )[0];
  const level1Id = level1.id;

  await db
    .insert(levels)
    .values({ id: LEVEL_2_ID, languageId, levelNumber: 2, name: "Level 2", status: "published" })
    .onConflictDoNothing({ target: levels.id });

  await db
    .insert(vocabularyGroups)
    .values({ id: VOCAB_GROUP_ID, levelId: level1Id, languageId, name: "Home & Basics", position: 1, status: "published" })
    .onConflictDoNothing({ target: vocabularyGroups.id });

  // Level 1 vocabulary: a plain noun, an article-requiring noun, and an
  // irregular-article noun — mirrors spec 07's fixture curriculum's
  // deliberate coverage, per §37's "exercising the actual schema" guidance.
  await db
    .insert(learningItems)
    .values([
      { id: ITEM_GATO_ID, languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 1, lessonPriority: 1 },
      { id: ITEM_CASA_ID, languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 2, lessonPriority: 2 },
      { id: ITEM_AGUA_ID, languageId, levelId: level1Id, type: "vocabulary", status: "published", position: 3, lessonPriority: 3 },
      { id: ITEM_Y_ID, languageId, levelId: level1Id, type: "grammar", status: "published", position: 4, lessonPriority: 4 },
      { id: ITEM_ROJO_ID, languageId, levelId: LEVEL_2_ID, type: "vocabulary", status: "published", position: 1, lessonPriority: 1 },
    ])
    .onConflictDoNothing({ target: learningItems.id });

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
