import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DbClient } from "@/db/client";
import { userItemProgress, userReviewPreferences, userSentenceGhostProgress } from "@/db/schema";
import { SENTENCE_GATO_ID, seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { submitGhostAnswer } from "./ghost-orchestration";
import { recordSentenceMiss } from "./ghost-repository";
import type { GhostMode } from "./review-preference";
import { startReviewSession, submitReviewAnswer } from "./review-orchestration";
import type { SrsStage } from "./srs-types";

async function markDue(tx: DbClient, userId: string, learningItemId: string, languageId: string, now?: number, srsStage: SrsStage = "beginner_2") {
  const past = new Date((now ?? Date.now()) - 60_000);
  await tx
    .insert(userItemProgress)
    .values({ userId, learningItemId, languageId, srsStage, nextReviewAt: past, correctCount: 0, incorrectCount: 0, reviewCount: 0, version: 0 })
    .onConflictDoUpdate({
      target: [userItemProgress.userId, userItemProgress.learningItemId],
      set: { srsStage, nextReviewAt: past, correctCount: 0, incorrectCount: 0, reviewCount: 0, version: 0 },
    });
}

async function setVocabularyGhostMode(tx: DbClient, userId: string, languageId: string, ghostMode: GhostMode) {
  await tx
    .insert(userReviewPreferences)
    .values({ userId, languageId, vocabularyGhostMode: ghostMode })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { vocabularyGhostMode: ghostMode },
    });
}

async function findGhostRow(tx: DbClient, userId: string, learningItemId: string, sentenceId: string) {
  const [row] = await tx
    .select()
    .from(userSentenceGhostProgress)
    .where(
      and(
        eq(userSentenceGhostProgress.userId, userId),
        eq(userSentenceGhostProgress.learningItemId, learningItemId),
        eq(userSentenceGhostProgress.sentenceId, sentenceId),
      ),
    );
  return row;
}

describe("submitReviewAnswer — Ghost Reviews miss-tracking (spec 20)", () => {
  it("an incorrect answer to a Cloze-presented question creates a Ghost under On (the default)", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T00:00:00Z");
      await markDue(tx, learnerId, gatoId, languageId, now);

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");
      expect(started.currentQuestion?.presentation).toEqual({ kind: "cloze_typed", sentenceBefore: "El ", sentenceAfter: " duerme." });

      const response = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        kind: "typed",
        answer: "perro",
        idempotencyKey: crypto.randomUUID(),
        now,
      });
      expect(response.feedback?.kind).toBe("incorrect");

      const ghost = await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID);
      expect(ghost).toMatchObject({
        missCount: 1,
        ghostStage: "ghost_1",
        nextReviewAt: new Date("2026-01-01T04:00:00Z"),
        contentType: "vocabulary",
      });
    });
  });

  it("an incorrect answer to a non-Cloze (Flashcard) question never creates a Ghost — there is no sentence to attach it to", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T00:00:00Z");
      await markDue(tx, learnerId, gatoId, languageId, now);
      await tx
        .insert(userReviewPreferences)
        .values({ userId: learnerId, languageId, vocabularyReviewType: "flashcard" })
        .onConflictDoUpdate({ target: [userReviewPreferences.userId, userReviewPreferences.languageId], set: { vocabularyReviewType: "flashcard" } });

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");
      expect(started.currentQuestion?.presentation.kind).toBe("reveal");

      await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        kind: "self_graded",
        knowsAnswer: false,
        idempotencyKey: crypto.randomUUID(),
        now,
      });

      const ghost = await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID);
      expect(ghost).toBeUndefined();
    });
  });

  it("Minimal only activates the Ghost after the same sentence is missed a second time", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T00:00:00Z");
      await markDue(tx, learnerId, gatoId, languageId, now);
      await setVocabularyGhostMode(tx, learnerId, languageId, "minimal");

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");

      const first = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        kind: "typed",
        answer: "perro",
        idempotencyKey: crypto.randomUUID(),
        now,
      });
      const afterFirst = await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID);
      expect(afterFirst).toMatchObject({ missCount: 1, ghostStage: null });

      // The sole unresolved question repeats immediately (`rescheduleReviewAfterIncorrect`'s own rule).
      // Well within the review session token's 1-hour TTL.
      const secondNow = now + 30 * 60 * 1000;
      await submitReviewAnswer(tx, {
        token: first.token,
        userId: learnerId,
        languageId,
        questionId: first.currentQuestion!.questionId,
        kind: "typed",
        answer: "perro",
        idempotencyKey: crypto.randomUUID(),
        now: secondNow,
      });
      const afterSecond = await findGhostRow(tx, learnerId, gatoId, SENTENCE_GATO_ID);
      expect(afterSecond).toMatchObject({ missCount: 2, ghostStage: "ghost_1", nextReviewAt: new Date(secondNow + 4 * 60 * 60 * 1000) });
    });
  });
});

describe("startReviewSession — Ghost Queue (spec 20)", () => {
  it("surfaces a due Ghost, re-derived and badge-identifiable, even when no normal review is due", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const activatedAt = Date.parse("2026-01-01T00:00:00Z");
      await recordSentenceMiss(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        sentenceId: SENTENCE_GATO_ID,
        contentType: "vocabulary",
        mode: "on",
        now: new Date(activatedAt),
      });

      const now = activatedAt + 5 * 60 * 60 * 1000; // past the 4-hour Ghost 1 schedule
      const result = await startReviewSession(tx, { userId: learnerId, languageId, now });

      expect(result.kind).toBe("empty"); // no normal review due
      expect(result.ghostReviews).toEqual([
        {
          ghostProgressId: expect.any(String),
          itemId: gatoId,
          itemType: "vocabulary",
          ghostStage: "ghost_1",
          sentenceBefore: "El ",
          sentenceAfter: " duerme.",
        },
      ]);
    });
  });
});

describe("submitGhostAnswer (spec 20 Ghost SRS)", () => {
  async function activateGatoGhost(tx: DbClient, userId: string, languageId: string, gatoId: string, now: number) {
    await recordSentenceMiss(tx, {
      userId,
      languageId,
      learningItemId: gatoId,
      sentenceId: SENTENCE_GATO_ID,
      contentType: "vocabulary",
      mode: "on",
      now: new Date(now),
    });
    const [row] = await tx
      .select()
      .from(userSentenceGhostProgress)
      .where(and(eq(userSentenceGhostProgress.userId, userId), eq(userSentenceGhostProgress.learningItemId, gatoId)));
    return row;
  }

  it("a correct typed answer advances the Ghost one stage", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T04:00:00Z");
      const ghost = await activateGatoGhost(tx, learnerId, languageId, gatoId, Date.parse("2026-01-01T00:00:00Z"));

      const result = await submitGhostAnswer(tx, {
        userId: learnerId,
        languageId,
        ghostProgressId: ghost.id,
        answer: "gato",
        idempotencyKey: crypto.randomUUID(),
        now,
      });

      expect(result).toMatchObject({ isCorrect: true, completed: false, ghostStage: "ghost_2", nextReviewAt: new Date("2026-01-01T16:00:00Z") });
    });
  });

  it("an incorrect typed answer resets the Ghost to Ghost 1 and reports the expected answer", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T04:00:00Z");
      const ghost = await activateGatoGhost(tx, learnerId, languageId, gatoId, Date.parse("2026-01-01T00:00:00Z"));

      const result = await submitGhostAnswer(tx, {
        userId: learnerId,
        languageId,
        ghostProgressId: ghost.id,
        answer: "perro",
        idempotencyKey: crypto.randomUUID(),
        now,
      });

      expect(result).toMatchObject({ isCorrect: false, completed: false, ghostStage: "ghost_1", nextReviewAt: new Date("2026-01-01T08:00:00Z"), expectedAnswer: "gato" });
    });
  });

  it("rejects a Ghost that does not belong to this user", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const ghost = await activateGatoGhost(tx, learnerId, languageId, gatoId, Date.parse("2026-01-01T00:00:00Z"));

      await expect(
        submitGhostAnswer(tx, {
          userId: "00000000-0000-0000-0000-000000000099",
          languageId,
          ghostProgressId: ghost.id,
          answer: "gato",
          idempotencyKey: crypto.randomUUID(),
          now: Date.parse("2026-01-01T04:00:00Z"),
        }),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    });
  });
});
