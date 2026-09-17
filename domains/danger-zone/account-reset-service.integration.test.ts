import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  decks,
  reviewEvents,
  userDismissedNotices,
  userItemProgress,
  userLanguageSettings,
  userLevelProgress,
  userNotes,
  userNotificationPreferences,
  userPreferences,
  userReviewPreferences,
  users,
  userSentenceGhostProgress,
  userStreakAdjustments,
  userSynonyms,
  userVacationPeriods,
} from "@/db/schema";
import { SENTENCE_GATO_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { getUnlockedLevels } from "@/domains/progress/repository";

import { resetEntireAccount } from "./account-reset-service";

/**
 * Seeds one real row in every table `resetEntireAccount` is supposed to
 * clear, plus non-default values on every identity/account-flow field it
 * resets on `users` itself — so this suite can assert against a fully
 * populated account, not an already-mostly-empty fixture.
 */
async function seedFullAccountState(
  tx: Parameters<typeof seedTestFixtures>[0],
  input: {
    learnerId: string;
    languageId: string;
    gatoId: string;
    level2Id: string;
  },
) {
  const { learnerId, languageId, gatoId, level2Id } = input;

  await tx.insert(reviewEvents).values({
    userId: learnerId,
    languageId,
    learningItemId: gatoId,
    reviewedAt: new Date("2026-08-01T00:00:00Z"),
    stageBefore: "beginner_1",
    stageAfter: "beginner_2",
    requiredQuestionCount: 1,
    incorrectAdjustmentCount: 0,
    result: "advanced",
  });

  await tx.insert(userSentenceGhostProgress).values({
    userId: learnerId,
    languageId,
    learningItemId: gatoId,
    sentenceId: SENTENCE_GATO_ID,
    contentType: "vocabulary",
    ghostStage: "ghost_1",
    nextReviewAt: new Date("2026-08-02T00:00:00Z"),
  });

  await tx
    .insert(userLevelProgress)
    .values({ userId: learnerId, levelId: level2Id, unlockedAt: new Date() });
  await tx
    .insert(userLanguageSettings)
    .values({ userId: learnerId, languageId, curriculumMode: "default_order" });
  await tx
    .insert(userReviewPreferences)
    .values({ userId: learnerId, languageId, grammarGhostMode: "off" });
  await tx
    .insert(userNotificationPreferences)
    .values({ userId: learnerId, newsUpdates: false });
  await tx
    .insert(userPreferences)
    .values({ userId: learnerId, hideEnglishReviews: true });
  await tx.insert(decks).values({
    languageId,
    kind: "personal",
    ownerUserId: learnerId,
    availability: "theme",
    name: "My deck",
  });
  await tx.insert(userVacationPeriods).values({
    userId: learnerId,
    startedAt: new Date("2026-07-01T00:00:00Z"),
    endedAt: new Date("2026-07-05T00:00:00Z"),
  });
  await tx
    .insert(userStreakAdjustments)
    .values({ userId: learnerId, value: 20 });
  await tx
    .insert(userDismissedNotices)
    .values({ userId: learnerId, noticeKey: "VACATION_LESSON_WARNING" });

  await tx
    .update(users)
    .set({
      username: "old_handle",
      displayName: "Old Name",
      onboardingCompletedAt: new Date("2026-06-01T00:00:00Z"),
      timezone: "America/Phoenix",
    })
    .where(eq(users.id, learnerId));
}

describe("resetEntireAccount (spec 20 Danger Zone)", () => {
  it("clears every learner-application-data table for this user", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, level2Id } =
        await seedTestFixtures(tx);
      await seedFullAccountState(tx, {
        learnerId,
        languageId,
        gatoId,
        level2Id,
      });

      await resetEntireAccount(tx, {
        userId: learnerId,
        idempotencyKey: crypto.randomUUID(),
        now: new Date("2026-08-10T00:00:00Z"),
      });

      const tables = [
        reviewEvents,
        userSentenceGhostProgress,
        userItemProgress,
        userLanguageSettings,
        userReviewPreferences,
        userNotificationPreferences,
        userPreferences,
        userNotes,
        userSynonyms,
        userVacationPeriods,
        userStreakAdjustments,
        userDismissedNotices,
      ] as const;

      for (const table of tables) {
        const rows = await tx
          .select()
          .from(table)
          .where(eq(table.userId, learnerId));
        expect(
          rows,
          `expected ${table} to be empty for the reset learner`,
        ).toHaveLength(0);
      }

      const ownedDecks = await tx
        .select()
        .from(decks)
        .where(eq(decks.ownerUserId, learnerId));
      expect(ownedDecks).toHaveLength(0);
    });
  });

  it("re-establishes exactly a freshly provisioned account's identity/onboarding fields, keeping Clerk identity and role", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, level2Id } =
        await seedTestFixtures(tx);
      await seedFullAccountState(tx, {
        learnerId,
        languageId,
        gatoId,
        level2Id,
      });
      const [before] = await tx
        .select()
        .from(users)
        .where(eq(users.id, learnerId));

      await resetEntireAccount(tx, {
        userId: learnerId,
        idempotencyKey: crypto.randomUUID(),
        now: new Date("2026-08-10T00:00:00Z"),
      });

      const [after] = await tx
        .select()
        .from(users)
        .where(eq(users.id, learnerId));
      expect(after.username).toBeNull();
      expect(after.displayName).toBeNull();
      expect(after.onboardingCompletedAt).toBeNull();
      expect(after.timezone).toBe("UTC");
      expect(after.activeLanguageId).toBe(languageId);
      // Never touched — this is what "Reset Entire Account keeps the external identity/login" means.
      expect(after.clerkUserId).toBe(before.clerkUserId);
      expect(after.role).toBe(before.role);
      expect(after.id).toBe(before.id);
    });
  });

  it("re-unlocks Level 1 and removes every other Level unlock — the same starting point a fresh account has", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, level1Id, level2Id } =
        await seedTestFixtures(tx);
      await seedFullAccountState(tx, {
        learnerId,
        languageId,
        gatoId,
        level2Id,
      });

      await resetEntireAccount(tx, {
        userId: learnerId,
        idempotencyKey: crypto.randomUUID(),
        now: new Date("2026-08-10T00:00:00Z"),
      });

      // NOTE: the fixture's own Level 1 is a fixture-only level (levelNumber 90, not the application's
      // real Level 1) — resetEntireAccount unlocks the *application's* real Level 1, a different id, so
      // the fixture's own level1Id must no longer be unlocked, and exactly one unlock must exist.
      const unlocked = await getUnlockedLevels(tx, learnerId, languageId);
      expect(unlocked).toHaveLength(1);
      expect(unlocked[0].levelId).not.toBe(level1Id);
      expect(unlocked[0].levelId).not.toBe(level2Id);
    });
  });

  it("never touches another user's data", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, developerId, languageId, gatoId, level2Id } =
        await seedTestFixtures(tx);
      await seedFullAccountState(tx, {
        learnerId,
        languageId,
        gatoId,
        level2Id,
      });
      await tx
        .insert(userStreakAdjustments)
        .values({ userId: developerId, value: 5 });
      await tx
        .insert(userDismissedNotices)
        .values({ userId: developerId, noticeKey: "OTHER_WARNING" });

      await resetEntireAccount(tx, {
        userId: learnerId,
        idempotencyKey: crypto.randomUUID(),
        now: new Date("2026-08-10T00:00:00Z"),
      });

      const developerStreak = await tx
        .select()
        .from(userStreakAdjustments)
        .where(eq(userStreakAdjustments.userId, developerId));
      expect(developerStreak).toHaveLength(1);
      const developerNotices = await tx
        .select()
        .from(userDismissedNotices)
        .where(eq(userDismissedNotices.userId, developerId));
      expect(developerNotices).toHaveLength(1);
    });
  });

  it("is idempotent — retrying with the same key does not re-run the wipe or fail against an already-empty account", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, level2Id } =
        await seedTestFixtures(tx);
      await seedFullAccountState(tx, {
        learnerId,
        languageId,
        gatoId,
        level2Id,
      });
      const idempotencyKey = crypto.randomUUID();
      const now = new Date("2026-08-10T00:00:00Z");

      const first = await resetEntireAccount(tx, {
        userId: learnerId,
        idempotencyKey,
        now,
      });
      const second = await resetEntireAccount(tx, {
        userId: learnerId,
        idempotencyKey,
        now,
      });

      expect(second).toEqual(first);
      const unlocked = await getUnlockedLevels(tx, learnerId, languageId);
      expect(unlocked).toHaveLength(1);
    });
  });
});
