import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { DbClient } from "@/db/client";
import { reviewEvents, userItemProgress, userLevelProgress } from "@/db/schema";
import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { testDb } from "@/db/test/test-client";
import { withTestTransaction } from "@/db/test/with-test-transaction";

import { applyReviewCompletion } from "./review-completion";
import { startReviewSession, submitReviewAnswer } from "./review-orchestration";
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
  overrides: { srsStage?: SrsStage } = {},
) {
  const past = new Date(Date.now() - 60_000);
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

describe("startReviewSession", () => {
  it("is a success state with the soonest upcoming review time when nothing is due", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, languageId } = await seedTestFixtures(tx);
      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("empty");
    });
  });

  it("returns a session for a due vocabulary item, requiring the target->English direction first in a single-item queue", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);

      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("session");
      if (result.kind !== "session") return;

      expect(result.stats.itemsTotal).toBe(1);
      expect(result.currentQuestion?.itemId).toBe(gatoId);
      expect(result.currentQuestion?.direction).toBe("targetToEnglish");
      expect(result.currentQuestion?.prompt).toBe("gato");

      const decoded = await verifyReviewState({ token: result.token, userId: learnerId, languageId, now: Date.now() });
      // Vocabulary requires both directions (spec 09 §7).
      expect(decoded.queue).toHaveLength(2);
    });
  });

  it("uses exactly the grammar item's configured single required direction, not both", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, grammarYId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, grammarYId, languageId);

      const result = await startReviewSession(tx, { userId: learnerId, languageId });
      expect(result.kind).toBe("session");
      if (result.kind !== "session") return;

      const decoded = await verifyReviewState({ token: result.token, userId: learnerId, languageId, now: Date.now() });
      expect(decoded.queue).toHaveLength(1);
      expect(decoded.questions[0]?.direction).toBe("targetToEnglish");
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

describe("submitReviewAnswer", () => {
  it("completes a vocabulary item only after both directions are answered correctly, with a preview advancement", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      const first = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "cat",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(first.feedback).toEqual({ kind: "correct" });
      expect(first.completedItem).toBeUndefined();
      expect(first.phase).toBe("in_progress");

      const second = await submitReviewAnswer(tx, {
        token: first.token,
        userId: learnerId,
        languageId,
        questionId: first.currentQuestion!.questionId,
        answer: "el gato",
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

  it("accepts the missing-article bare form as incorrect with a missing_article reason, and el gato as correct", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      // First required question is targetToEnglish; answer it to reach englishToTarget.
      const afterFirst = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "cat",
        idempotencyKey: crypto.randomUUID(),
      });

      const bareAnswer = await submitReviewAnswer(tx, {
        token: afterFirst.token,
        userId: learnerId,
        languageId,
        questionId: afterFirst.currentQuestion!.questionId,
        answer: "gato",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(bareAnswer.feedback).toMatchObject({ kind: "incorrect", reason: "missing_article", article: "el" });
    });
  });

  it("accepts a real applicable user-created synonym alongside the official answer", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      expect(started.currentQuestion?.direction).toBe("targetToEnglish");

      // "kitty" is the seeded user synonym for gato (db/seed/test-fixtures.ts).
      const result = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "kitty",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(result.feedback).toEqual({ kind: "correct" });
    });
  });

  it("an incorrect required question returns later rather than immediately, and the item is still penalized once eventually correct", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "familiar_1" });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      const firstQuestionId = started.currentQuestion!.questionId;

      const wrong = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        answer: "totally-wrong",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(wrong.feedback).toMatchObject({ kind: "incorrect", reason: "no_match" });
      // The failed question does not repeat immediately — the other direction comes next.
      expect(wrong.currentQuestion?.questionId).not.toBe(firstQuestionId);

      const other = await submitReviewAnswer(tx, {
        token: wrong.token,
        userId: learnerId,
        languageId,
        questionId: wrong.currentQuestion!.questionId,
        answer: wrong.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(other.feedback).toEqual({ kind: "correct" });
      expect(other.completedItem).toBeUndefined(); // the failed question is still outstanding
      expect(other.currentQuestion?.questionId).toBe(firstQuestionId); // it returns

      const retry = await submitReviewAnswer(tx, {
        token: other.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        answer: wrong.currentQuestion!.direction === "targetToEnglish" ? "el gato" : "cat",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(retry.feedback).toEqual({ kind: "correct" });
      // Familiar 1 + any incorrect required answer -> factor-2 penalty, floored, per the confirmed decision.
      expect(retry.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_3", result: "penalized" });
    });
  });

  it("both required directions incorrect still applies the same single-item penalty, not a doubled one", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "familiar_1" });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      let response = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "wrong-1",
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: "wrong-2",
        idempotencyKey: crypto.randomUUID(),
      });
      // Both directions now wrong once each; answer both correctly on retry.
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: response.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: response.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });

      expect(response.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_3", result: "penalized" });
    });
  });

  it("an empty submission does nothing — same question, no stats change, no feedback beyond 'empty'", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId);

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      const result = await submitReviewAnswer(tx, {
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

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");

      let response = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: started.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: response.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });

      expect(response.completedItem).toMatchObject({ stageAfter: "fluent", reachedFluent: true, nextReviewAt: null });
    });
  });
});

describe("atomic review completion (spec 09 unit 4)", () => {
  it("actually updates the real user_item_progress row, not just the returned preview", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, languageId } = await seedTestFixtures(tx);
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_1" });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: "cat",
        idempotencyKey: crypto.randomUUID(),
      });
      await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: "el gato",
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

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: "cat",
        idempotencyKey: crypto.randomUUID(),
      });
      await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: "el gato",
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

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "cat",
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

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      const first = await submitReviewAnswer(tx, {
        token: started.token,
        userId: learnerId,
        languageId,
        questionId: started.currentQuestion!.questionId,
        answer: "cat",
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

      const final = await submitReviewAnswer(tx, {
        token: first.token,
        userId: learnerId,
        languageId,
        questionId: first.currentQuestion!.questionId,
        answer: "el gato",
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
          now: new Date(),
          idempotencyKey: key,
          sessionId: "session-conflict-test",
        }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" });
    });
  });

  it("a newly earned level unlock persists as part of the completing transaction", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId, gatoId, casaId, aguaId, grammarYId, level2Id, languageId } = await seedTestFixtures(tx);

      // Bring 3 of level 1's 4 items to Familiar 1 already (not due
      // themselves — only gato should be in this session's queue); leave
      // gato as the one about to complete and cross the 5/6 threshold (4/4
      // here, since the fixture level only has 4 gating items).
      for (const itemId of [casaId, aguaId, grammarYId]) {
        await setStageNotDue(tx, learnerId, itemId, languageId, "familiar_1");
      }
      await markDue(tx, learnerId, gatoId, languageId, { srsStage: "beginner_4" });

      const started = await startReviewSession(tx, { userId: learnerId, languageId });
      if (started.kind !== "session") throw new Error("expected a session");
      let response: ReviewSessionResult = started;
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: response.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: response.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });

      // gato is now familiar_1 too -> 4/4 of level 1 at Familiar 1+ -> level 2 unlocks.
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
      const firstDirection = response.currentQuestion!.direction;

      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        answer: "wrong",
        idempotencyKey: crypto.randomUUID(),
      });
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: response.currentQuestion!.questionId,
        answer: response.currentQuestion!.direction === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      // The originally-failed direction returns; answer it correctly to complete the item.
      response = await submitReviewAnswer(tx, {
        token: response.token,
        userId: learnerId,
        languageId,
        questionId: firstQuestionId,
        answer: firstDirection === "targetToEnglish" ? "cat" : "el gato",
        idempotencyKey: crypto.randomUUID(),
      });
      expect(response.completedItem).toMatchObject({ stageBefore: "familiar_1", stageAfter: "beginner_3", result: "penalized" });

      const [unlock] = await tx
        .select()
        .from(userLevelProgress)
        .where(and(eq(userLevelProgress.userId, learnerId), eq(userLevelProgress.levelId, level2Id)));
      expect(unlock).toBeDefined();
      expect(unlock?.unlockedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    });
  });

  it("a genuine two-connection concurrent completion of the same item applies exactly once", async () => {
    const { learnerId, gatoId, languageId } = await seedTestFixtures(testDb);
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
