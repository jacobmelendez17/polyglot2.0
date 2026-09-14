import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DbClient } from "@/db/client";
import { learningItems, learningItemSentences, reviewEvents, userItemProgress, userLevelProgress, userReviewPreferences, userSynonyms } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import { updateTimezone } from "@/domains/users/user-repository";

import { applyReviewCompletion } from "./review-completion";
import { startReviewSession, submitReviewAnswer } from "./review-orchestration";
import type { ReviewQueueTimingMode, ReviewType, SrsIntervalMode, SrsStrictness } from "./review-preference";
import { verifyReviewState } from "./review-token";
import type { ReviewSessionResult } from "./review-types";
import type { SrsStage } from "./srs-types";

/**
 * Upserts a due `user_item_progress` row — not every fixture item has one
 * seeded by default (only `gatoId` does; `grammarYId`/`rojoId` don't, per
 * `db/seed/test-fixtures.ts`, and spec 09 §5 requires a progress row to
 * already exist for an item to be a normal due review), so this creates one
 * when needed rather than assuming an update will find a row to touch.
 * Always resets `correctCount`/`incorrectCount`/`reviewCount`/`version` to a
 * known baseline (0), rather than leaving whatever the seed fixture happens
 * to contain (`gatoId`'s seeded row starts at `correctCount: 1, reviewCount:
 * 1`) — tests that assert on these counters should never depend on the
 * seed's own incidental values.
 */
async function markDue(
  tx: DbClient,
  userId: string,
  learningItemId: string,
  languageId: string,
  overrides: { srsStage?: SrsStage; now?: number } = {},
) {
  const past = new Date((overrides.now ?? Date.now()) - 60_000);
  const srsStage = overrides.srsStage ?? "beginner_2";
  const baseline = { srsStage, nextReviewAt: past, correctCount: 0, incorrectCount: 0, reviewCount: 0, version: 0 };
  await tx
    .insert(userItemProgress)
    .values({ userId, learningItemId, languageId, ...baseline })
    .onConflictDoUpdate({
      target: [userItemProgress.userId, userItemProgress.learningItemId],
      set: baseline,
    });
}

/**
 * Upserts a progress row at a given stage that is **not** due (a future
 * `nextReviewAt`) — for setting up other items' SRS state (e.g. for a
 * level-unlock ratio check) without pulling them into the session queue
 * `markDue` would create.
 */
async function setStageNotDue(tx: DbClient, userId: string, learningItemId: string, languageId: string, srsStage: SrsStage) {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const values = { userId, learningItemId, languageId, srsStage, nextReviewAt: future };
  await tx
    .insert(userItemProgress)
    .values(values)
    .onConflictDoUpdate({
      target: [userItemProgress.userId, userItemProgress.learningItemId],
      set: { srsStage, nextReviewAt: future },
    });
}

/**
 * Spec 20 Reviews — Review Types. Vocabulary defaults to Cloze (Manual),
 * which for `gatoId` specifically (the item most of these tests already use)
 * finds a real compatible example sentence ("El gato duerme.", seeded by
 * `db/seed/test-fixtures.ts`) and collapses it to a single, sentence-blank
 * `englishToTarget` question. Every test in this file that needs the
 * pre-spec-20 shape — two independently-gradable questions per item, to
 * exercise retry ordering, penalties, idempotency, and level-unlock
 * machinery that has nothing to do with Review Types itself — sets
 * `"flashcard"` explicitly instead of relying on whatever the default
 * happens to be, and grades with `submitKnows` (self-graded) rather than
 * `submitTyped`, since Flashcard is never typed.
 */
async function setVocabularyReviewType(tx: DbClient, userId: string, languageId: string, reviewType: ReviewType) {
  await tx
    .insert(userReviewPreferences)
    .values({ userId, languageId, vocabularyReviewType: reviewType })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { vocabularyReviewType: reviewType },
    });
}

/** Removes `gatoId`'s seeded example sentence link for one test, forcing Cloze (Manual)'s "no compatible sentence" fallback deterministically rather than depending on the fixture never gaining one. */
async function removeExampleSentence(tx: DbClient, learningItemId: string) {
  await tx.delete(learningItemSentences).where(eq(learningItemSentences.learningItemId, learningItemId));
}

/** Spec 20 SRS Strictness — sets the vocabulary strictness a fresh session should resolve at `startReviewSession` time. */
async function setVocabularySrsStrictness(tx: DbClient, userId: string, languageId: string, srsStrictness: SrsStrictness) {
  await tx
    .insert(userReviewPreferences)
    .values({ userId, languageId, vocabularySrsStrictness: srsStrictness })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { vocabularySrsStrictness: srsStrictness },
    });
}

/** Spec 20 SRS Interval — sets the vocabulary interval mode a fresh session should resolve at `startReviewSession` time. */
async function setVocabularySrsIntervalMode(tx: DbClient, userId: string, languageId: string, srsIntervalMode: SrsIntervalMode) {
  await tx
    .insert(userReviewPreferences)
    .values({ userId, languageId, vocabularySrsIntervalMode: srsIntervalMode })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { vocabularySrsIntervalMode: srsIntervalMode },
    });
}

/** Spec 20 Review Queue Timing — one value per language (not split grammar/vocabulary), resolved at `startReviewSession` time. */
async function setReviewQueueTiming(tx: DbClient, userId: string, languageId: string, reviewQueueTiming: ReviewQueueTimingMode) {
  await tx
    .insert(userReviewPreferences)
    .values({ userId, languageId, reviewQueueTiming })
    .onConflictDoUpdate({
      target: [userReviewPreferences.userId, userReviewPreferences.languageId],
      set: { reviewQueueTiming },
    });
}

type CommonSubmitFields = { token: string; userId: string; languageId: string; questionId: string; idempotencyKey: string; now?: number };

function submitTyped(tx: DbClient, input: CommonSubmitFields & { answer: string }) {
  return submitReviewAnswer(tx, { ...input, kind: "typed" });
}

function submitKnows(tx: DbClient, input: CommonSubmitFields & { knowsAnswer: boolean }) {
  return submitReviewAnswer(tx, { ...input, kind: "self_graded" });
}

describe("startReviewSession", () => {
  it("is a success state with the soonest upcoming review time when nothing is due", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("empty");
    });
  });

  it("returns a session for a due vocabulary item under the default Cloze (Manual) review type — a single sentence-blank englishToTarget question", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);

      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("session");
      if (result.kind !== "session") return;

      expect(result.stats.itemsTotal).toBe(1);
      expect(result.currentQuestion?.itemId).toBe(gatoId);
      expect(result.currentQuestion?.direction).toBe("englishToTarget");
      // "El gato duerme." is gato's seeded example sentence — the blanked word is "gato".
      expect(result.currentQuestion?.presentation).toEqual({ kind: "cloze_typed", sentenceBefore: "El ", sentenceAfter: " duerme." });

      const decoded = await verifyReviewState({ token: result.token, userId: learnerId, languageId, now: Date.now() });
      // Cloze (Manual) asks vocabulary as one question, not two (2026-09-13 decision: "there is no other direction").
      expect(decoded.queue).toHaveLength(1);
    });
  });

  it("asks vocabulary in both directions under Flashcard, unaffected by Cloze's single-question collapse", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("session");
      if (result.kind !== "session") return;

      const decoded = await verifyReviewState({ token: result.token, userId: learnerId, languageId, now: Date.now() });
      expect(decoded.queue).toHaveLength(2);
      expect(result.currentQuestion?.presentation.kind).toBe("reveal");
    });
  });

  it("uses exactly the grammar item's configured single required direction, not both, regardless of review type", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, grammarYId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, grammarYId, languageId);

      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("session");
      if (result.kind !== "session") return;

      const decoded = await verifyReviewState({ token: result.token, userId: learnerId, languageId, now: Date.now() });
      expect(decoded.queue).toHaveLength(1);
      expect(decoded.questions[0]?.direction).toBe("targetToEnglish");
      // grammarYId's one configured question is targetToEnglish, which Cloze never reshapes (spec 20 Reviews).
      expect(result.currentQuestion?.presentation).toEqual({ kind: "typed", prompt: "y" });
    });
  });

  it("combines multiple due items (spanning levels) into one session — cross-language filtering itself is covered in domains/progress's own tests", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, rojoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      // rojoId is Level 2, same language.
      await markDue(tx, learnerId, rojoId, languageId);

      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("session");
      if (result.kind !== "session") return;
      expect(result.stats.itemsTotal).toBe(2);
    });
  });
});

describe("submitReviewAnswer — Cloze (Manual) fallback (no compatible sentence)", () => {
  it("accepts the missing-article bare form as incorrect with a missing_article reason, and el gato as correct", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      await removeExampleSentence(tx, gatoId);

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      // With no compatible sentence, gato's single collapsed question falls
      // back to the ordinary englishToTarget prompt ("cat" -> "el gato").
      expect(started.currentQuestion?.presentation).toEqual({ kind: "typed", prompt: "cat" });

      const bareAnswer = await submitTyped(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "gato",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(bareAnswer.feedback).toMatchObject({ kind: "incorrect", reason: "missing_article", article: "el" });

      const correct = await submitTyped(tx, {
        token: bareAnswer.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(correct.feedback).toEqual({ kind: "correct" });
    });
  });

  it("accepts a real applicable user-created term-side synonym alongside the official answer", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      await removeExampleSentence(tx, gatoId);
      // "term" side applies to englishToTarget (produce the target word) — the
      // seed's own "kitty" synonym is "meaning"-side (targetToEnglish), which
      // no longer exists for vocabulary under Cloze (Manual)'s collapse.
      await tx.insert(userSynonyms).values({
        userId: learnerId,
        learningItemId: gatoId,
        side: "term",
        value: "minino",
        normalizedValue: "minino",
      });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      expect(started.currentQuestion?.direction).toBe("englishToTarget");

      // Like the official term, a term-side synonym still needs gato's
      // article to be marked correct in the englishToTarget direction — only
      // "meaning"-side (targetToEnglish) synonyms are article-free.
      const result = await submitTyped(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "el minino",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.feedback).toEqual({ kind: "correct" });
    });
  });

  it("rejects a typed submission for a question the server resolved as self-graded (reveal), and vice versa", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      expect(started.currentQuestion?.presentation.kind).toBe("reveal");

      await expect(
        submitTyped(tx, {
          token: started.token,
          userId: learnerId,
          languageId,
          questionId: started.currentQuestion!.questionId,
          answer: "cat",
          idempotencyKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "INVALID_REVIEW_STATE" });
    });
  });
});

describe("submitReviewAnswer — Flashcard (self-graded, both directions — completion/retry/penalty machinery)", () => {
  it("completes a vocabulary item only after both directions are answered correctly, with a preview advancement", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      const first = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(first.feedback).toEqual({ kind: "correct" });
      expect(first.completedItem).toBeUndefined();
      expect(first.phase).toBe("in_progress");

      const second = await submitKnows(tx, {
        token: first.token,
        userId: learnerId,
        languageId,
        questionId: first.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(second.feedback).toEqual({ kind: "correct" });
      expect(second.completedItem).toEqual({
        itemId: gatoId,
        stageBefore: "beginner_1",
        stageAfter: "beginner_2",
        result: "advanced",
        nextReviewAt: expect.any(Date),
        reachedFluent: false,
      });
      expect(second.phase).toBe("complete");
    });
  });

  it("Don't Know is an incorrect SRS outcome and shows self-graded feedback with no expected-answer breakdown", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      const result = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: false,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.feedback).toEqual({ kind: "self_graded_incorrect" });
    });
  });

  it("an incorrect required question returns later rather than immediately, and the item is still penalized once eventually correct", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "familiar_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      const firstQuestionId = started.currentQuestion!.questionId;

      const wrong = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        knowsAnswer: false,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(wrong.feedback).toEqual({ kind: "self_graded_incorrect" });
      // The failed question does not repeat immediately — the other direction comes next.
      expect(wrong.currentQuestion?.questionId).not.toBe(firstQuestionId);

      const other = await submitKnows(tx, {
        token: wrong.token,
        userId: learnerId,
        languageId,
        questionId: wrong.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(other.feedback).toEqual({ kind: "correct" });
      expect(other.completedItem).toBeUndefined(); // the failed question is still outstanding
      expect(other.currentQuestion?.questionId).toBe(firstQuestionId); // it returns

      const retry = await submitKnows(tx, {
        token: other.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(retry.feedback).toEqual({ kind: "correct" });
      // Spec 20 SRS Strictness default (1 Stage): any incorrect required answer drops exactly one stage, regardless of tier.
      expect(retry.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_4", result: "penalized" });
    });
  });

  it("both required directions incorrect still applies the same single-item penalty, not a doubled one", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "familiar_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      let response = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: false,
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: false,
        idempotencyKey: crypto.randomUUID(),
      });
      // Both directions now wrong once each; answer both correctly on retry.
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(response.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_4", result: "penalized" });
    });
  });

  it("an empty typed submission does nothing — same question, no stats change, no feedback beyond 'empty'", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);
      await removeExampleSentence(tx, gatoId); // typed fallback prompt

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      const result = await submitTyped(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "   ",
        idempotencyKey: crypto.randomUUID(),
      });

      expect(result.feedback).toEqual({ kind: "empty" });
      expect(result.currentQuestion?.questionId).toBe(started.currentQuestion?.questionId);
      expect(result.stats).toEqual(started.stats);
    });
  });

  it("reaching Fluent ends the scheduled review cycle (no next review time)", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "master" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      let response = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });

      expect(response.completedItem).toMatchObject({ stageAfter: "fluent", reachedFluent: true, nextReviewAt: null });
    });
  });
});

describe("submitReviewAnswer — SRS Strictness (spec 20)", () => {
  /**
   * Both required directions must eventually be answered correctly for an
   * item to complete at all (an incorrect answer reschedules its question
   * rather than satisfying it) — `hadIncorrectRequiredAnswer` still ends up
   * true, which is what triggers the penalty. Mirrors "an incorrect
   * required question returns later..." above: wrong once, then correct on
   * the other direction, then correct on the retry of the first.
   */
  async function completeWithOneEarlierIncorrectAnswer(tx: DbClient, token: string, firstQuestionId: string, userId: string, languageId: string) {
    const wrong = await submitKnows(tx, { token, userId, languageId, questionId: firstQuestionId, knowsAnswer: false, idempotencyKey: crypto.randomUUID() });
    const other = await submitKnows(tx, {
      token: wrong.token,
      userId,
      languageId,
      questionId: wrong.currentQuestion!.questionId,
      knowsAnswer: true,
      idempotencyKey: crypto.randomUUID(),
    });
    return submitKnows(tx, {
      token: other.token,
      userId,
      languageId,
      questionId: firstQuestionId,
      knowsAnswer: true,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  it("a non-default strictness resolved at session start is what actually applies at completion", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "master" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      await setVocabularySrsStrictness(tx, learnerId, languageId, "full");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      const response = await completeWithOneEarlierIncorrectAnswer(
        tx,
        started.token,
        started.currentQuestion!.questionId,
        learnerId,
        languageId,
      );

      // "Full" resets straight to Beginner 1 regardless of starting stage —
      // the old model (or "1 Stage") would have left this at Intermediate/Master.
      expect(response.completedItem).toMatchObject({ stageBefore: "master", stageAfter: "beginner_1", result: "penalized" });
    });
  });

  it("a strictness change made after a session starts does not affect that already-open session (spec 20's 'active review keeps its original settings')", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "familiar_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      // Default (1 Stage) in effect when this session starts.

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      // The learner changes their setting to "Full" in another tab while this session is still open.
      await setVocabularySrsStrictness(tx, learnerId, languageId, "full");

      const response = await completeWithOneEarlierIncorrectAnswer(
        tx,
        started.token,
        started.currentQuestion!.questionId,
        learnerId,
        languageId,
      );

      // Still the 1-Stage result this session started with (Beginner 4), not Full's Beginner 1.
      expect(response.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_4", result: "penalized" });
    });
  });
});

describe("submitReviewAnswer — SRS Interval (spec 20)", () => {
  const FIXED_NOW = Date.parse("2026-01-01T00:00:00Z");

  /** Both required directions answered correctly — the item advances one stage and schedules its next review under the configured SRS Interval mode. */
  async function completeBothDirectionsCorrectly(tx: DbClient, token: string, firstQuestionId: string, userId: string, languageId: string) {
    const first = await submitKnows(tx, {
      token,
      userId,
      languageId,
      questionId: firstQuestionId,
      knowsAnswer: true,
      idempotencyKey: crypto.randomUUID(),
      now: FIXED_NOW,
    });
    return submitKnows(tx, {
      token: first.token,
      userId,
      languageId,
      questionId: first.currentQuestion!.questionId,
      knowsAnswer: true,
      idempotencyKey: crypto.randomUUID(),
      now: FIXED_NOW,
    });
  }

  it("a non-default interval mode resolved at session start is what actually applies at completion", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_2", now: FIXED_NOW });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      await setVocabularySrsIntervalMode(tx, learnerId, languageId, "longest");

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now: FIXED_NOW });
      if (started.kind !== "session") throw new Error("expected a session");

      const response = await completeBothDirectionsCorrectly(tx, started.token, started.currentQuestion!.questionId, learnerId, languageId);

      // Advances beginner_2 -> beginner_3; "Longest" schedules beginner_3 36 hours out, not Default's 24.
      expect(response.completedItem).toMatchObject({ stageBefore: "beginner_2", stageAfter: "beginner_3", result: "advanced" });
      expect(response.completedItem?.nextReviewAt).toEqual(new Date(FIXED_NOW + 36 * 60 * 60 * 1000));
    });
  });

  it("an interval mode change made after a session starts does not affect that already-open session's scheduling", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_2", now: FIXED_NOW });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      // Default in effect when this session starts.

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now: FIXED_NOW });
      if (started.kind !== "session") throw new Error("expected a session");

      // The learner changes their setting to "Longest" in another tab while this session is still open.
      await setVocabularySrsIntervalMode(tx, learnerId, languageId, "longest");

      const response = await completeBothDirectionsCorrectly(tx, started.token, started.currentQuestion!.questionId, learnerId, languageId);

      // Still the Default-mode schedule (24 hours) this session started with, not Longest's 36.
      expect(response.completedItem).toMatchObject({ stageBefore: "beginner_2", stageAfter: "beginner_3", result: "advanced" });
      expect(response.completedItem?.nextReviewAt).toEqual(new Date(FIXED_NOW + 24 * 60 * 60 * 1000));
    });
  });

  it("resolves a calendar-month interval correctly for a Master-stage completion, not a fixed-day approximation", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      // Default mode: Master -> Fluent is 3 calendar months out.
      const now = Date.parse("2026-01-31T00:00:00Z");
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "intermediate", now });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");

      const first = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
        now,
      });
      const response = await submitKnows(tx, {
        token: first.token,
        userId: learnerId,
        languageId,
        questionId: first.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
        now,
      });

      // intermediate -> master; January 31 + 3 calendar months rolls over (April has 30 days) to May 1, not a fixed 90-day offset.
      expect(response.completedItem).toMatchObject({ stageBefore: "intermediate", stageAfter: "master", result: "advanced" });
      expect(response.completedItem?.nextReviewAt).toEqual(new Date("2026-05-01T00:00:00Z"));
    });
  });
});

describe("submitReviewAnswer — Review Queue Timing (spec 20)", () => {
  /** Both required directions answered correctly — the item advances one stage and its raw due time is rounded per the session-resolved Review Queue Timing mode. */
  async function completeBothDirectionsCorrectly(tx: DbClient, token: string, firstQuestionId: string, userId: string, languageId: string, now: number) {
    const first = await submitKnows(tx, {
      token,
      userId,
      languageId,
      questionId: firstQuestionId,
      knowsAnswer: true,
      idempotencyKey: crypto.randomUUID(),
      now,
    });
    return submitKnows(tx, {
      token: first.token,
      userId,
      languageId,
      questionId: first.currentQuestion!.questionId,
      knowsAnswer: true,
      idempotencyKey: crypto.randomUUID(),
      now,
    });
  }

  it("Start of Hour rounds the raw due time forward to the next hour boundary", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T00:15:00Z");
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_2", now });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      await setReviewQueueTiming(tx, learnerId, languageId, "start_of_hour");

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");

      const response = await completeBothDirectionsCorrectly(tx, started.token, started.currentQuestion!.questionId, learnerId, languageId, now);

      // beginner_2 -> beginner_3, Default interval 24h: raw due 2026-01-02T00:15:00Z, rounded forward to 01:00.
      expect(response.completedItem).toMatchObject({ stageBefore: "beginner_2", stageAfter: "beginner_3", result: "advanced" });
      expect(response.completedItem?.nextReviewAt).toEqual(new Date("2026-01-02T01:00:00Z"));
    });
  });

  it("Start of Day resolved at session start aligns the raw due time to midnight in the learner's own timezone", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T10:00:00Z");
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_2", now });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      await setReviewQueueTiming(tx, learnerId, languageId, "start_of_day");
      await updateTimezone(tx, learnerId, "America/Phoenix");

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");

      const response = await completeBothDirectionsCorrectly(tx, started.token, started.currentQuestion!.questionId, learnerId, languageId, now);

      // beginner_2 -> beginner_3, Default interval 24h: raw due 2026-01-02T10:00:00Z (03:00 Phoenix), aligned to that same Phoenix calendar date's midnight (07:00Z).
      expect(response.completedItem).toMatchObject({ stageBefore: "beginner_2", stageAfter: "beginner_3", result: "advanced" });
      expect(response.completedItem?.nextReviewAt).toEqual(new Date("2026-01-02T07:00:00Z"));
    });
  });

  it("a queue timing (and timezone) change made after a session starts does not affect that already-open session's rounding", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const now = Date.parse("2026-01-01T00:15:00Z");
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_2", now });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      // Start of Hour (the default) in effect when this session starts.

      const started = await startReviewSession(tx, { userId: learnerId, languageId, now });
      if (started.kind !== "session") throw new Error("expected a session");

      // The learner switches to Start of Day and a different timezone in another tab while this session is still open.
      await setReviewQueueTiming(tx, learnerId, languageId, "start_of_day");
      await updateTimezone(tx, learnerId, "America/Phoenix");

      const response = await completeBothDirectionsCorrectly(tx, started.token, started.currentQuestion!.questionId, learnerId, languageId, now);

      // Still Start of Hour's rounding (01:00), not Start of Day's Phoenix midnight.
      expect(response.completedItem).toMatchObject({ stageBefore: "beginner_2", stageAfter: "beginner_3", result: "advanced" });
      expect(response.completedItem?.nextReviewAt).toEqual(new Date("2026-01-02T01:00:00Z"));
    });
  });
});

describe("atomic review completion (spec 09 unit 4)", () => {
  it("actually updates the real user_item_progress row, not just the returned preview", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });

      const [row] = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      expect(row?.srsStage).toBe("beginner_2");
      expect(row?.version).toBe(1);
      expect(row?.reviewCount).toBe(1);
      expect(row?.correctCount).toBe(1);
    });
  });

  it("persists a review_events row for the completed item, and it survives after the session is discarded", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      // Session token is now simply discarded, as a real client abandoning
      // the tab would do — no further calls made with it.

      const [event] = await tx.select().from(reviewEvents).where(eq(reviewEvents.learningItemId, gatoId));
      expect(event).toBeDefined();
      expect(event?.stageBefore).toBe("beginner_1");
      expect(event?.stageAfter).toBe("beginner_2");
      expect(event?.result).toBe("advanced");
      expect(event?.requiredQuestionCount).toBe(2);
      expect(event?.incorrectAdjustmentCount).toBe(0);
    });
  });

  it("a half-completed item (only one of two required directions answered) changes nothing in the database", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });

      const [row] = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      expect(row?.srsStage).toBe("beginner_1");
      expect(row?.version).toBe(0);
      expect(row?.reviewCount).toBe(0);

      const [event] = await tx.select().from(reviewEvents).where(eq(reviewEvents.learningItemId, gatoId));
      expect(event).toBeUndefined();
    });
  });

  it("a stale completion (version already changed by another completion) is rejected, and changes nothing", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });

      // Simulate a second device completing the item first: bump the row's
      // version directly, out from under a session snapshot that already
      // captured version 0.
      await tx
        .update(userItemProgress)
        .set({ version: 5 })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      await expect(
        applyReviewCompletion(tx, {
          userId: learnerId,
          languageId,
          learningItemId: gatoId,
          expectedVersion: 0, // stale — the real row is now at version 5
          requiredQuestionCount: 2,
          hadIncorrectRequiredAnswer: false,
          srsStrictness: "one_stage",
          srsIntervalMode: "default",
          reviewQueueTiming: "start_of_hour",
          timeZone: "UTC",
          now: new Date(),
          idempotencyKey: crypto.randomUUID(),
          sessionId: "session-stale-test",
        }),
      ).rejects.toMatchObject({ code: "STALE_REVIEW" });

      const [row] = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      expect(row?.version).toBe(5);
      expect(row?.srsStage).toBe("beginner_1");

      const [event] = await tx.select().from(reviewEvents).where(eq(reviewEvents.learningItemId, gatoId));
      expect(event).toBeUndefined();
    });
  });

  it("a review that is no longer due (already completed elsewhere, next_review_at moved to the future) is rejected as REVIEW_NOT_DUE", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      const future = new Date(Date.now() + 60 * 60 * 1000);
      await tx
        .update(userItemProgress)
        .set({ nextReviewAt: future })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      await expect(
        applyReviewCompletion(tx, {
          userId: learnerId,
          languageId,
          learningItemId: gatoId,
          expectedVersion: 0,
          requiredQuestionCount: 2,
          hadIncorrectRequiredAnswer: false,
          srsStrictness: "one_stage",
          srsIntervalMode: "default",
          reviewQueueTiming: "start_of_hour",
          timeZone: "UTC",
          now: new Date(),
          idempotencyKey: crypto.randomUUID(),
          sessionId: "session-not-due-test",
        }),
      ).rejects.toMatchObject({ code: "REVIEW_NOT_DUE" });
    });
  });

  it("submitReviewAnswer recovers gracefully when the completing submission turns out stale — grades the answer, reports staleItem, and still advances the session (spec 09 §11)", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      const first = await submitKnows(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(first.completedItem).toBeUndefined();

      // Simulate a second device completing gato's review in between, out
      // from under this session's snapshot — bump the row's version
      // directly, as a real concurrent completion would leave it.
      await tx
        .update(userItemProgress)
        .set({ version: 99 })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

      const final = await submitKnows(tx, {
        token: first.token,
        userId: learnerId,
        languageId,
        questionId: first.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });

      // The learner's own answer was still graded correctly...
      expect(final.feedback).toEqual({ kind: "correct" });
      // ...but no completion preview, since this request didn't actually apply one...
      expect(final.completedItem).toBeUndefined();
      // ...and the UI is told specifically why, per spec 09 §11's exact instruction.
      expect(final.staleItem).toEqual({ itemId: gatoId });
      // The session still advances past the item rather than getting stuck retrying it forever.
      expect(final.phase).toBe("complete");
      expect(final.stats.itemsCompleted).toBe(1);

      // And the real row is untouched by this request — still at the other device's version.
      const [row] = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      expect(row?.version).toBe(99);
    });
  });

  it("the same idempotency key with the same payload applies the mutation exactly once on replay", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      const key = crypto.randomUUID();
      const input = {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        expectedVersion: 0,
        requiredQuestionCount: 2,
        hadIncorrectRequiredAnswer: false,
        srsStrictness: "one_stage" as const,
        srsIntervalMode: "default" as const,
        reviewQueueTiming: "start_of_hour" as const,
        timeZone: "UTC",
        now: new Date(),
        idempotencyKey: key,
        sessionId: "session-replay-test",
      };

      const first = await applyReviewCompletion(tx, input);
      const replay = await applyReviewCompletion(tx, input);

      expect(replay.stageAfter).toBe(first.stageAfter);

      const [row] = await tx
        .select()
        .from(userItemProgress)
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      // Applied once, not twice — version only advanced by 1.
      expect(row?.version).toBe(1);

      const events = await tx.select().from(reviewEvents).where(eq(reviewEvents.learningItemId, gatoId));
      expect(events).toHaveLength(1);
    });
  });

  it("the same idempotency key with a different payload conflicts rather than silently applying either", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, grammarYId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });
      await markDue(tx, learnerId, grammarYId, languageId, { srsStage: "beginner_1" });
      const key = crypto.randomUUID();

      await applyReviewCompletion(tx, {
        userId: learnerId,
        languageId,
        learningItemId: gatoId,
        expectedVersion: 0,
        requiredQuestionCount: 2,
        hadIncorrectRequiredAnswer: false,
        srsStrictness: "one_stage",
          srsIntervalMode: "default",
          reviewQueueTiming: "start_of_hour",
          timeZone: "UTC",
        now: new Date(),
        idempotencyKey: key,
        sessionId: "session-conflict-test",
      });

      await expect(
        applyReviewCompletion(tx, {
          userId: learnerId,
          languageId,
          learningItemId: grammarYId, // a different item -> different payload, same key
          expectedVersion: 0,
          requiredQuestionCount: 1,
          hadIncorrectRequiredAnswer: false,
          srsStrictness: "one_stage",
          srsIntervalMode: "default",
          reviewQueueTiming: "start_of_hour",
          timeZone: "UTC",
          now: new Date(),
          idempotencyKey: key,
          sessionId: "session-conflict-test",
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" });
    });
  });

  it("a newly earned level unlock persists as part of the completing transaction", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, level1Id, level2Id, languageId } = await seedTestFixtures(tx);
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");

      // Bring every *other* published item in level 1 to Familiar 1 already
      // (not due themselves — only gato should be in this session's queue),
      // leaving gato as the one about to complete and cross the 5/6
      // threshold.
      //
      // Read from the database rather than listing the three fixture items:
      // this level is shared with the real curriculum
      // (`TEST_DATABASE_URL` and `DATABASE_URL` are the same database), and
      // any real word published into it counts toward the unlock
      // denominator. Hardcoding "the other three" made the test assert the
      // size of the curriculum, and it started failing the moment one real
      // word was published.
      const gatingItems = await tx
        .select({ id: learningItems.id })
        .from(learningItems)
        .where(and(eq(learningItems.levelId, level1Id), eq(learningItems.status, "published")));
      for (const item of gatingItems) {
        if (item.id === gatoId) continue;
        await setStageNotDue(tx, learnerId, item.id, languageId, "familiar_1");
      }
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_4" });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });

      // gato is now familiar_1 too, so every gating item in level 1 is at
      // Familiar 1+ and level 2 unlocks.
      const [unlock] = await tx
        .select()
        .from(userLevelProgress)
        .where(and(eq(userLevelProgress.userId, learnerId), eq(userLevelProgress.levelId, level2Id)));
      expect(unlock).toBeDefined();
    });
  });

  it("an already-earned level unlock is not revoked when an item later falls back below the threshold", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, level2Id, languageId } = await seedTestFixtures(tx);
      await setVocabularyReviewType(tx, learnerId, languageId, "flashcard");
      // Level 2 already unlocked (as if earned earlier).
      await tx.insert(userLevelProgress).values({ userId: learnerId, levelId: level2Id, unlockedAt: new Date("2026-01-01T00:00:00Z") });

      // gato now fails one required direction and gets penalized back down
      // once fully completed (wrong on the first direction, correct on the
      // other, then a correct retry of the originally-failed one).
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "familiar_1" });
      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      const firstQuestionId = response.currentQuestion!.questionId;

      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        knowsAnswer: false,
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      // The originally-failed direction returns; answer it correctly to complete the item.
      response = await submitKnows(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        knowsAnswer: true,
        idempotencyKey: crypto.randomUUID(),
      });
      expect(response.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_4", result: "penalized" });

      const [unlock] = await tx
        .select()
        .from(userLevelProgress)
        .where(and(eq(userLevelProgress.userId, learnerId), eq(userLevelProgress.levelId, level2Id)));
      expect(unlock).toBeDefined();
      expect(unlock?.unlockedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    });
  });

  it("a genuine two-connection concurrent completion of the same item applies exactly once", async () => {
    const { learnerId, gatoId, languageId } = await seedTestFixtures(testDb, { committed: true });
    const before = await testDb
      .select()
      .from(userItemProgress)
      .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
    const original = before[0]!;

    await testDb
      .update(userItemProgress)
      .set({ nextReviewAt: new Date(Date.now() - 60_000), srsStage: "beginner_1" })
      .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));

    try {
      const attempt = () =>
        applyReviewCompletion(testDb, {
          userId: learnerId,
          languageId,
          learningItemId: gatoId,
          expectedVersion: original.version,
          requiredQuestionCount: 2,
          hadIncorrectRequiredAnswer: false,
          srsStrictness: "one_stage",
          srsIntervalMode: "default",
          reviewQueueTiming: "start_of_hour",
          timeZone: "UTC",
          now: new Date(),
          idempotencyKey: crypto.randomUUID(), // different keys — this proves the row lock/version guard itself, independent of idempotency
          sessionId: "session-concurrent-a",
        }).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason }),
        );

      const [a, b] = await Promise.all([attempt(), attempt()]);
      const outcomes = [a, b];
      const applied = outcomes.filter((o) => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");

      expect(applied).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as { status: "rejected"; reason: unknown }).reason).toMatchObject({ code: "STALE_REVIEW" });
    } finally {
      await testDb
        .update(userItemProgress)
        .set({
          srsStage: original.srsStage,
          nextReviewAt: original.nextReviewAt,
          version: original.version,
          correctCount: original.correctCount,
          reviewCount: original.reviewCount,
          lastReviewedAt: original.lastReviewedAt,
        })
        .where(and(eq(userItemProgress.userId, learnerId), eq(userItemProgress.learningItemId, gatoId)));
      await testDb.delete(reviewEvents).where(eq(reviewEvents.learningItemId, gatoId));
    }
  });
});
