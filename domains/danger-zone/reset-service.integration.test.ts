import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { learningItems, levels, userItemProgress, userReviewPreferences, userSentenceGhostProgress } from "@/db/schema";
import { FIXTURE_LEVEL_NUMBER, SENTENCE_GATO_ID, SENTENCE_Y_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { recordSentenceMiss } from "@/domains/srs/ghost-repository";
import { AppError } from "@/lib/errors/app-error";

import { getItemProgress, getUnlockedLevels, unlockLevel } from "../progress/repository";
import { resetContentTypeReviews, resetToLevel } from "./reset-service";

const NOW = new Date("2026-06-01T00:00:00Z");

describe("resetContentTypeReviews (spec 20 Danger Zone)", () => {
  it("Main Reviews resets the given content type's items to Beginner 1 and leaves the other content type alone", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, grammarYId } = await seedTestFixtures(tx);
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: grammarYId, languageId, srsStage: "master", correctCount: 5 });

      const result = await resetContentTypeReviews(tx, {
        userId: learnerId,
        languageId,
        contentType: "vocabulary",
        target: "main",
        idempotencyKey: crypto.randomUUID(),
        now: NOW,
      });

      expect(result.affectedItemCount).toBe(1);
      expect((await getItemProgress(tx, learnerId, gatoId))?.srsStage).toBe("beginner_1");
      // Grammar was never a candidate for a Vocabulary reset.
      expect((await getItemProgress(tx, learnerId, grammarYId))?.srsStage).toBe("master");
    });
  });

  it("Ghost Reviews removes Ghost state without touching the normal SRS stage (the spec's own worked example)", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId } = await seedTestFixtures(tx);
      await tx.update(userItemProgress).set({ srsStage: "master" }).where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      await recordSentenceMiss(tx, { userId: learnerId, languageId, learningItemId: gatoId, sentenceId: SENTENCE_GATO_ID, contentType: "vocabulary", mode: "on", now: NOW });

      const result = await resetContentTypeReviews(tx, {
        userId: learnerId,
        languageId,
        contentType: "vocabulary",
        target: "ghost",
        idempotencyKey: crypto.randomUUID(),
        now: NOW,
      });

      expect(result.affectedItemCount).toBe(1);
      const [ghostRow] = await tx.select().from(userSentenceGhostProgress).where(eq(userSentenceGhostProgress.learningItemId, gatoId));
      expect(ghostRow).toBeUndefined();
      // "Vocabulary remains Master."
      expect((await getItemProgress(tx, learnerId, gatoId))?.srsStage).toBe("master");
    });
  });

  it("Leech Reviews resets only items that qualify as Leeches under the learner's minimum-stage preference", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId } = await seedTestFixtures(tx);
      // Lower the threshold so gato (which only ever reached Beginner 2 in this fixture) can qualify.
      await tx.insert(userReviewPreferences).values({ userId: learnerId, languageId, vocabularyMinimumLeechStage: "beginner_1" });
      // 3 incorrect / max(0,1)^1.5 = 3 > 1, and highestSrsStageReached (beginner_2) >= minimum (beginner_1).
      await tx
        .update(userItemProgress)
        .set({ incorrectCount: 3, currentCorrectStreak: 0, highestSrsStageReached: "beginner_2" })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      // casa has no incorrect answers at all — never a Leech.
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: casaId, languageId, srsStage: "beginner_3" });

      const result = await resetContentTypeReviews(tx, {
        userId: learnerId,
        languageId,
        contentType: "vocabulary",
        target: "leech",
        idempotencyKey: crypto.randomUUID(),
        now: NOW,
      });

      expect(result.affectedItemCount).toBe(1);
      expect((await getItemProgress(tx, learnerId, gatoId))?.srsStage).toBe("beginner_1");
      expect((await getItemProgress(tx, learnerId, casaId))?.srsStage).toBe("beginner_3");
    });
  });

  it("a CEFR band resets only that band's items, retaining a different band untouched", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, casaId, level1Id } = await seedTestFixtures(tx);
      await tx.update(levels).set({ cefrLevel: "A1" }).where(eq(levels.id, level1Id));
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: casaId, languageId, srsStage: "master" });

      const result = await resetContentTypeReviews(tx, {
        userId: learnerId,
        languageId,
        contentType: "vocabulary",
        target: "A1",
        idempotencyKey: crypto.randomUUID(),
        now: NOW,
      });

      // Both gato and casa are on the (now A1-tagged) fixture level, so both reset.
      expect(result.affectedItemCount).toBe(2);
      expect((await getItemProgress(tx, learnerId, gatoId))?.srsStage).toBe("beginner_1");
      expect((await getItemProgress(tx, learnerId, casaId))?.srsStage).toBe("beginner_1");
    });
  });

  it("is idempotent — retrying with the same key returns the original result rather than resetting twice", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      const idempotencyKey = crypto.randomUUID();
      const input = { userId: learnerId, languageId, contentType: "vocabulary" as const, target: "main" as const, idempotencyKey, now: NOW };

      const first = await resetContentTypeReviews(tx, input);
      const second = await resetContentTypeReviews(tx, input);

      expect(second).toEqual(first);
    });
  });
});

describe("resetToLevel (spec 20 Danger Zone)", () => {
  it("removes progress, Ghost state, and Level unlocks above the target, keeping the target Level's own unlock", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, gatoId, level1Id, level2Id, rojoId } = await seedTestFixtures(tx);
      // Correct the shared dev/test database's stale committed `rojo` levelId back to the fixture's second level (see progress-repository.integration.test.ts's CEFR test for the full explanation) — scoped to this rolled-back transaction only.
      await tx.update(learningItems).set({ levelId: level2Id }).where(eq(learningItems.id, rojoId));

      await unlockLevel(tx, { userId: learnerId, levelId: level2Id, now: NOW });
      await tx.insert(userItemProgress).values({ userId: learnerId, learningItemId: rojoId, languageId, srsStage: "beginner_1" });
      await recordSentenceMiss(tx, { userId: learnerId, languageId, learningItemId: rojoId, sentenceId: SENTENCE_Y_ID, contentType: "vocabulary", mode: "on", now: NOW });

      const result = await resetToLevel(tx, {
        userId: learnerId,
        languageId,
        targetLevelNumber: FIXTURE_LEVEL_NUMBER,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(result.affectedItemCount).toBe(1);
      expect(await getItemProgress(tx, learnerId, rojoId)).toBeNull();
      expect(await getItemProgress(tx, learnerId, gatoId)).not.toBeNull();
      const [ghostRow] = await tx.select().from(userSentenceGhostProgress).where(eq(userSentenceGhostProgress.learningItemId, rojoId));
      expect(ghostRow).toBeUndefined();

      const unlocked = await getUnlockedLevels(tx, learnerId, languageId);
      expect(unlocked.map((progress) => progress.levelId)).toEqual([level1Id]);
    });
  });

  it("rejects a target that is not strictly earlier than the learner's current Level", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);

      await expect(
        resetToLevel(tx, { userId: learnerId, languageId, targetLevelNumber: FIXTURE_LEVEL_NUMBER, idempotencyKey: crypto.randomUUID() }),
      ).rejects.toThrow(AppError);
    });
  });

  it("rejects a target Level the learner has never unlocked", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId, level2Id } = await seedTestFixtures(tx);
      await unlockLevel(tx, { userId: learnerId, levelId: level2Id, now: NOW });

      await expect(
        resetToLevel(tx, { userId: learnerId, languageId, targetLevelNumber: 1, idempotencyKey: crypto.randomUUID() }),
      ).rejects.toThrow(AppError);
    });
  });
});
