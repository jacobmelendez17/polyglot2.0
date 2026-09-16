import { and, eq } from "drizzle-orm";

import { grammarItems, languages, learningItems, levels, userItemProgress, userLanguageSettings, userLevelProgress, users, vocabularyItems } from "@/db/schema";
import type { SrsStage } from "@/domains/srs";
import { getDefaultLanguageCode } from "@/domains/users";
import { completeOnboarding, saveCurriculumPreference } from "@/domains/users/user-repository";

import { withE2EDb } from "./e2e-db";

/**
 * Spec 22 — direct-DB precondition helpers shared by the E2E specs.
 *
 * These exist because the product has no fast UI path to some starting
 * states (an item already due for review, a freshly un-onboarded account)
 * and spec 22 explicitly allows "test database helpers" for exactly this.
 * Every function is idempotent and scoped to the two permanent E2E
 * identities, so specs never depend on run order (spec 22's Parallelism
 * rule) — each one re-establishes the state it needs regardless of what an
 * earlier spec left behind.
 */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for E2E tests. Set it in .env.local — see .env.example.`);
  return value;
}

export async function getLearnerId(): Promise<string> {
  return withE2EDb(async (db) => {
    const clerkUserId = requiredEnv("E2E_LEARNER_CLERK_USER_ID");
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
    if (!row) throw new Error("No E2E learner row found — run `npm run e2e:setup` first.");
    return row.id;
  });
}

export interface E2EFixtureLookup {
  languageId: string;
  levelId: string;
  vocabularyItemIdByTerm: Record<string, string>;
  grammarItemIdByStructure: Record<string, string>;
  pendingItemId: string;
}

/** Reads the seeded fixture's real (randomly-generated) ids back out of the database, so specs never hardcode a UUID that changes on every `npm run e2e:setup`. */
export async function getFixtureIds(): Promise<E2EFixtureLookup> {
  return withE2EDb(async (db) => {
    const languageCode = getDefaultLanguageCode();
    const [language] = await db.select({ id: languages.id }).from(languages).where(eq(languages.code, languageCode)).limit(1);
    if (!language) throw new Error("No E2E language row found — run `npm run e2e:setup` first.");

    const [level] = await db
      .select({ id: levels.id })
      .from(levels)
      .where(and(eq(levels.languageId, language.id), eq(levels.levelNumber, 1)))
      .limit(1);
    if (!level) throw new Error("No E2E Level 1 row found — run `npm run e2e:setup` first.");

    const vocabRows = await db
      .select({ id: learningItems.id, term: vocabularyItems.term, status: learningItems.status })
      .from(learningItems)
      .innerJoin(vocabularyItems, eq(vocabularyItems.learningItemId, learningItems.id))
      .where(eq(learningItems.levelId, level.id));
    const grammarRows = await db
      .select({ id: learningItems.id, structure: grammarItems.structure })
      .from(learningItems)
      .innerJoin(grammarItems, eq(grammarItems.learningItemId, learningItems.id))
      .where(eq(learningItems.levelId, level.id));

    const vocabularyItemIdByTerm: Record<string, string> = {};
    let pendingItemId = "";
    for (const row of vocabRows) {
      vocabularyItemIdByTerm[row.term] = row.id;
      if (row.status === "pending") pendingItemId = row.id;
    }
    const grammarItemIdByStructure: Record<string, string> = {};
    for (const row of grammarRows) grammarItemIdByStructure[row.structure] = row.id;

    return { languageId: language.id, levelId: level.id, vocabularyItemIdByTerm, grammarItemIdByStructure, pendingItemId };
  });
}

/**
 * Resets the E2E learner to a brand-new-account state: onboarding
 * incomplete, no curriculum preference chosen, no item/level progress
 * except the Level 1 unlock every new account receives (see
 * domains/users/user-repository.ts's provisionUser). Used by the New
 * Learner flow, which needs this as its starting point regardless of what
 * any other spec did to this same shared learner beforehand.
 */
export async function resetLearnerToNewAccountState(): Promise<void> {
  const learnerId = await getLearnerId();
  await withE2EDb(async (db) => {
    await db.update(users).set({ onboardingCompletedAt: null }).where(eq(users.id, learnerId));
    await db.delete(userLanguageSettings).where(eq(userLanguageSettings.userId, learnerId));
    await db.delete(userItemProgress).where(eq(userItemProgress.userId, learnerId));
    await db.delete(userLevelProgress).where(eq(userLevelProgress.userId, learnerId));

    const languageCode = getDefaultLanguageCode();
    const [language] = await db.select({ id: languages.id }).from(languages).where(eq(languages.code, languageCode)).limit(1);
    const [level] = await db
      .select({ id: levels.id })
      .from(levels)
      .where(and(eq(levels.languageId, language!.id), eq(levels.levelNumber, 1)))
      .limit(1);
    await db.insert(userLevelProgress).values({ userId: learnerId, levelId: level!.id, unlockedAt: new Date() });
  });
}

/**
 * Ensures the E2E learner has completed onboarding and chosen a Learning
 * Queue mode — the baseline state every spec except the dedicated New
 * Learner flow assumes. Idempotent: safe to call at the start of every
 * spec file regardless of what state the learner is currently in.
 */
export async function ensureLearnerOnboarded(): Promise<void> {
  const learnerId = await getLearnerId();
  await withE2EDb(async (db) => {
    await completeOnboarding(db, learnerId, new Date());

    const languageCode = getDefaultLanguageCode();
    const [language] = await db.select({ id: languages.id }).from(languages).where(eq(languages.code, languageCode)).limit(1);
    await saveCurriculumPreference(db, { userId: learnerId, languageId: language!.id, curriculumMode: "default_order" });
  });
}

/** Clears learning-item progress for the fixture's own items, so a lesson spec sees them as eligible again regardless of what an earlier run enrolled. */
export async function resetLearnerItemProgress(): Promise<void> {
  const learnerId = await getLearnerId();
  await withE2EDb(async (db) => {
    await db.delete(userItemProgress).where(eq(userItemProgress.userId, learnerId));
  });
}

/** Makes one vocabulary item due for review right now, bypassing the real SRS interval wait (spec 22's "Do not wait for real SRS time to pass"). */
export async function makeVocabularyItemDue(term: string, stage: SrsStage = "beginner_2"): Promise<void> {
  const learnerId = await getLearnerId();
  const fixture = await getFixtureIds();
  const learningItemId = fixture.vocabularyItemIdByTerm[term];
  if (!learningItemId) throw new Error(`No fixture vocabulary item for term "${term}".`);

  await withE2EDb(async (db) => {
    const dueAt = new Date(Date.now() - 60_000);
    await db
      .insert(userItemProgress)
      .values({
        userId: learnerId,
        learningItemId,
        languageId: fixture.languageId,
        srsStage: stage,
        nextReviewAt: dueAt,
        correctCount: 1,
        reviewCount: 1,
      })
      .onConflictDoUpdate({
        target: [userItemProgress.userId, userItemProgress.learningItemId],
        set: { srsStage: stage, nextReviewAt: dueAt },
      });
  });
}
