import type { DbClient } from "@/db/client";
import { languages, userLevelProgress, users } from "@/db/schema";
import { createItem, createLevel, createVocabularyGroup, publishItem, updateLevel, updateVocabularyGroup } from "@/domains/admin/publication-service";
import { getDefaultLanguageCode } from "@/domains/users";

/**
 * Spec 22's E2E curriculum fixture — a small, deterministic, real Spanish
 * (es-MX) Level 1, seeded through the same domain services the real Admin
 * area uses (`domains/admin/publication-service.ts`), not a hand-rolled
 * parallel representation. It exists only in `E2E_DATABASE_URL` and is never
 * the actively-authored real Level 1 (spec 22's explicit prohibition).
 *
 * Deliberately small and stable: content edits to the real launch curriculum
 * must never affect this fixture, and vice versa — they live in entirely
 * separate Neon branches.
 */

export const E2E_VOCAB_GROUPS = [
  {
    name: "Casa y Familia",
    items: [
      { term: "gato", primaryMeaning: "cat", article: "el", partOfSpeech: "noun" },
      { term: "casa", primaryMeaning: "house", article: "la", partOfSpeech: "noun" },
      { term: "agua", primaryMeaning: "water", article: "el", partOfSpeech: "noun" },
    ],
  },
  {
    name: "Colores",
    items: [
      { term: "rojo", primaryMeaning: "red", partOfSpeech: "adjective" },
      { term: "azul", primaryMeaning: "blue", partOfSpeech: "adjective" },
      { term: "verde", primaryMeaning: "green", partOfSpeech: "adjective" },
    ],
  },
] as const;

export const E2E_GRAMMAR_ITEMS = [
  { structure: "y", primaryMeaning: "and", explanation: "Connects two words, phrases, or clauses." },
  { structure: "pero", primaryMeaning: "but", explanation: "Introduces a contrast between two ideas." },
] as const;

export const E2E_ADMIN_TEST_GROUP_NAME = "Admin Test Content";
export const E2E_PENDING_ITEM = { term: "amarillo", primaryMeaning: "yellow", partOfSpeech: "adjective" } as const;

export interface E2EFixtureIds {
  languageId: string;
  learnerId: string;
  adminId: string;
  levelId: string;
  /** Learning-item id keyed by its vocabulary term (e.g. "gato"). */
  vocabularyItemIdByTerm: Record<string, string>;
  /** Learning-item id keyed by its grammar structure (e.g. "y"). */
  grammarItemIdByStructure: Record<string, string>;
  /** The one deliberately unpublished item, for the admin-publication flow. */
  pendingItemId: string;
  pendingItemTerm: string;
}

export interface SeedE2EFixturesOptions {
  learnerClerkUserId: string;
  adminClerkUserId: string;
}

export async function seedE2EFixtures(db: DbClient, options: SeedE2EFixturesOptions): Promise<E2EFixtureIds> {
  const languageCode = getDefaultLanguageCode();
  const [language] = await db.insert(languages).values({ code: languageCode, slug: "spanish", name: "Spanish" }).returning();
  const languageId = language!.id;

  // The admin identity is provisioned directly (not through
  // domains/users/user-repository.ts's provisionUser) because that function
  // requires Level 1 to already exist — a real chicken-and-egg here, since
  // curriculum authorship below needs an existing user id to attribute audit
  // events to. This mirrors how every real deployment bootstraps its first
  // admin: a direct row, not a self-serve elevation flow.
  const [adminUser] = await db
    .insert(users)
    .values({ clerkUserId: options.adminClerkUserId, role: "admin", timezone: "UTC", activeLanguageId: languageId })
    .returning();
  const adminId = adminUser!.id;

  const [learnerUser] = await db
    .insert(users)
    .values({ clerkUserId: options.learnerClerkUserId, role: "user", timezone: "UTC", activeLanguageId: languageId })
    .returning();
  const learnerId = learnerUser!.id;

  const { levelId } = await createLevel(db, {
    languageId,
    levelNumber: 1,
    name: "Level 1",
    actorUserId: adminId,
    idempotencyKey: crypto.randomUUID(),
  });

  // Every new learner has Level 1 unlocked from the start (see
  // domains/users/user-repository.ts's provisionUser) — reproduced directly
  // here since this identity bypasses that function.
  await db.insert(userLevelProgress).values({ userId: learnerId, levelId, unlockedAt: new Date() });

  const vocabularyItemIdByTerm: Record<string, string> = {};
  for (const group of E2E_VOCAB_GROUPS) {
    const { groupId } = await createVocabularyGroup(db, {
      levelId,
      languageId,
      name: group.name,
      actorUserId: adminId,
      idempotencyKey: crypto.randomUUID(),
    });
    await updateVocabularyGroup(db, { groupId, actorUserId: adminId, status: "published", idempotencyKey: crypto.randomUUID() });

    for (const item of group.items) {
      const { learningItemId } = await createItem(db, {
        languageId,
        levelId,
        actorUserId: adminId,
        type: "vocabulary",
        fields: {
          vocabularyGroupId: groupId,
          term: item.term,
          primaryMeaning: item.primaryMeaning,
          article: "article" in item ? item.article : null,
          partOfSpeech: item.partOfSpeech,
          acceptedAnswers: [],
        },
        idempotencyKey: crypto.randomUUID(),
      });
      await publishItem(db, { learningItemId, actorUserId: adminId, expectedVersion: 1, idempotencyKey: crypto.randomUUID() });
      vocabularyItemIdByTerm[item.term] = learningItemId;
    }
  }

  const grammarItemIdByStructure: Record<string, string> = {};
  for (const item of E2E_GRAMMAR_ITEMS) {
    const { learningItemId } = await createItem(db, {
      languageId,
      levelId,
      actorUserId: adminId,
      type: "grammar",
      fields: {
        structure: item.structure,
        primaryMeaning: item.primaryMeaning,
        explanation: item.explanation,
        requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
        acceptedAnswers: [],
      },
      idempotencyKey: crypto.randomUUID(),
    });
    await publishItem(db, { learningItemId, actorUserId: adminId, expectedVersion: 1, idempotencyKey: crypto.randomUUID() });
    grammarItemIdByStructure[item.structure] = learningItemId;
  }

  // "Admin Test Content" — one deliberately unpublished item, for the
  // admin-publication E2E flow (spec 22's "Critical Flow — Admin Publication").
  const { groupId: pendingGroupId } = await createVocabularyGroup(db, {
    levelId,
    languageId,
    name: E2E_ADMIN_TEST_GROUP_NAME,
    actorUserId: adminId,
    idempotencyKey: crypto.randomUUID(),
  });
  await updateVocabularyGroup(db, { groupId: pendingGroupId, actorUserId: adminId, status: "published", idempotencyKey: crypto.randomUUID() });

  const { learningItemId: pendingItemId } = await createItem(db, {
    languageId,
    levelId,
    actorUserId: adminId,
    type: "vocabulary",
    fields: {
      vocabularyGroupId: pendingGroupId,
      term: E2E_PENDING_ITEM.term,
      primaryMeaning: E2E_PENDING_ITEM.primaryMeaning,
      partOfSpeech: E2E_PENDING_ITEM.partOfSpeech,
      acceptedAnswers: [],
    },
    idempotencyKey: crypto.randomUUID(),
  });
  // Deliberately never published.

  await updateLevel(db, { levelId, actorUserId: adminId, status: "published", idempotencyKey: crypto.randomUUID() });

  return {
    languageId,
    learnerId,
    adminId,
    levelId,
    vocabularyItemIdByTerm,
    grammarItemIdByStructure,
    pendingItemId,
    pendingItemTerm: E2E_PENDING_ITEM.term,
  };
}
