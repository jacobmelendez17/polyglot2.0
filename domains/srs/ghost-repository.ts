import { and, count, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { userSentenceGhostProgress } from "@/db/schema";

import { calculateGhostAnswerResult, calculateGhostMissOutcome } from "./ghost-progress";
import type { GhostStage } from "./ghost-progress";
import type { GhostMode } from "./review-preference";
import type { ReviewItemType } from "./review-types";

/**
 * Ghost-progress persistence (spec 20 Ghost Reviews) — takes an injected
 * `DbClient`, matching every other repository in this codebase, so it can
 * be called from `review-orchestration.ts` (which must stay database-
 * secret-free and `DbClient`-testable) and tested against a real,
 * rolled-back transaction.
 */

type GhostProgressRow = typeof userSentenceGhostProgress.$inferSelect;

export type GhostProgress = {
  id: string;
  userId: string;
  languageId: string;
  learningItemId: string;
  sentenceId: string;
  contentType: ReviewItemType;
  missCount: number;
  ghostStage: GhostStage | null;
  nextReviewAt: Date | null;
  activatedAt: Date | null;
  completedAt: Date | null;
};

function toGhostProgress(row: GhostProgressRow): GhostProgress {
  return {
    id: row.id,
    userId: row.userId,
    languageId: row.languageId,
    learningItemId: row.learningItemId,
    sentenceId: row.sentenceId,
    contentType: row.contentType,
    missCount: row.missCount,
    ghostStage: row.ghostStage,
    nextReviewAt: row.nextReviewAt,
    activatedAt: row.activatedAt,
    completedAt: row.completedAt,
  };
}

/**
 * One Ghost by id, scoped to `userId` the same ownership-checked way
 * `applyGhostAnswer` does — a Ghost belonging to another learner reads as
 * not found. Unlocked (no `FOR UPDATE`): used to resolve *what* a due Ghost
 * is asking before grading it, never to decide what to write — the actual
 * mutation goes through `applyGhostAnswer`'s own locked read.
 */
export async function getGhostProgressById(db: DbClient, userId: string, ghostProgressId: string): Promise<GhostProgress | null> {
  const [row] = await db
    .select()
    .from(userSentenceGhostProgress)
    .where(and(eq(userSentenceGhostProgress.id, ghostProgressId), eq(userSentenceGhostProgress.userId, userId)))
    .limit(1);
  return row ? toGhostProgress(row) : null;
}

/**
 * Spec 20 Ghost Reviews — what one incorrect *normal* review of a
 * Cloze-presented (sentence-bearing) question does to that sentence's Ghost
 * state. A no-op when `mode` is `"off"`, or when this sentence already has
 * an active Ghost (`calculateGhostMissOutcome`'s own rule — only answering
 * that Ghost review changes it further).
 *
 * Locks the existing row (if any) for the duration of this small
 * transaction to avoid a lost update if the same sentence is somehow missed
 * twice concurrently — the same `SELECT ... FOR UPDATE` technique
 * `domains/progress/repository.ts`'s `lockItemProgressForReview` already
 * uses for the analogous normal-SRS race.
 */
export async function recordSentenceMiss(
  db: DbClient,
  input: {
    userId: string;
    languageId: string;
    learningItemId: string;
    sentenceId: string;
    contentType: ReviewItemType;
    mode: GhostMode;
    now: Date;
  },
): Promise<void> {
  if (input.mode === "off") return;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(userSentenceGhostProgress)
      .where(
        and(
          eq(userSentenceGhostProgress.userId, input.userId),
          eq(userSentenceGhostProgress.learningItemId, input.learningItemId),
          eq(userSentenceGhostProgress.sentenceId, input.sentenceId),
        ),
      )
      .for("update");

    const outcome = calculateGhostMissOutcome({
      mode: input.mode,
      existingMissCount: existing?.missCount ?? 0,
      existingGhostStage: existing?.ghostStage ?? null,
      now: input.now,
    });

    if (outcome.kind === "no_op") return;

    // `updatedAt` set explicitly to the domain's own `now`, not left to
    // Drizzle's `$onUpdate` default — that fires with the real wall clock
    // at statement-execution time, which would silently diverge from a
    // sandboxed learner's offset `now` (spec 11) and from every other
    // "caller supplies now, never `new Date()` internally" SRS timestamp in
    // this codebase. `applyGhostVacationSchedulingAdjustment` depends on
    // this column meaning exactly "when did the current wait begin," in
    // domain time.
    const values =
      outcome.kind === "record_miss"
        ? { missCount: outcome.missCount, updatedAt: input.now }
        : {
            missCount: outcome.missCount,
            ghostStage: outcome.ghostStage,
            nextReviewAt: outcome.nextReviewAt,
            activatedAt: input.now,
            updatedAt: input.now,
          };

    if (existing) {
      await tx.update(userSentenceGhostProgress).set(values).where(eq(userSentenceGhostProgress.id, existing.id));
      return;
    }

    await tx.insert(userSentenceGhostProgress).values({
      userId: input.userId,
      languageId: input.languageId,
      learningItemId: input.learningItemId,
      sentenceId: input.sentenceId,
      contentType: input.contentType,
      createdAt: input.now,
      ...values,
    });
  });
}

export type ApplyGhostAnswerResult = { kind: "completed"; ghostProgress: GhostProgress } | { kind: "continuing"; ghostProgress: GhostProgress };

/**
 * Spec 20 Ghost Reviews — grading the Ghost review itself ("Ghost SRS" /
 * "Incorrect Ghost Answer"). Never touches the normal item's SRS — this
 * function only ever reads/writes `user_sentence_ghost_progress`.
 *
 * `userId` is required and checked directly in the `WHERE` clause (not
 * merely compared after the fact) so a Ghost belonging to another learner
 * is indistinguishable from a nonexistent one — the caller gets `null`
 * either way and reports `ITEM_NOT_FOUND` generically, never leaking
 * whether the id exists for someone else.
 */
export async function applyGhostAnswer(
  db: DbClient,
  input: { userId: string; ghostProgressId: string; isCorrect: boolean; now: Date },
): Promise<ApplyGhostAnswerResult | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(userSentenceGhostProgress)
      .where(and(eq(userSentenceGhostProgress.id, input.ghostProgressId), eq(userSentenceGhostProgress.userId, input.userId)))
      .for("update");

    // Not found, not this learner's, or not actually an active Ghost (defensive — the caller only ever reaches here for a Ghost it just fetched as due, which always has a stage).
    if (!row || !row.ghostStage) return null;

    const result = calculateGhostAnswerResult(row.ghostStage, input.isCorrect, input.now);

    if (result.kind === "completed") {
      const [updated] = await tx
        .update(userSentenceGhostProgress)
        .set({ nextReviewAt: null, completedAt: input.now, updatedAt: input.now })
        .where(eq(userSentenceGhostProgress.id, row.id))
        .returning();
      return { kind: "completed", ghostProgress: toGhostProgress(updated) };
    }

    const [updated] = await tx
      .update(userSentenceGhostProgress)
      .set({ ghostStage: result.ghostStage, nextReviewAt: result.nextReviewAt, updatedAt: input.now })
      .where(eq(userSentenceGhostProgress.id, row.id))
      .returning();
    return { kind: "continuing", ghostProgress: toGhostProgress(updated) };
  });
}

/**
 * Every due Ghost review for this learner/language (spec 20 Ghost Queue —
 * "in addition to normal reviews"). Deliberately not filtered by the
 * *current* Ghost Mode setting: an already-active Ghost stays available
 * even after the learner turns the setting to Off ("Existing active Ghosts
 * should remain available unless explicitly reset from Danger Zone") — Off
 * only stops new Ghosts from being *created* (`recordSentenceMiss`).
 */
export async function getDueGhosts(db: DbClient, userId: string, languageId: string, now: Date): Promise<GhostProgress[]> {
  const rows = await db
    .select()
    .from(userSentenceGhostProgress)
    .where(
      and(
        eq(userSentenceGhostProgress.userId, userId),
        eq(userSentenceGhostProgress.languageId, languageId),
        isNotNull(userSentenceGhostProgress.nextReviewAt),
        lte(userSentenceGhostProgress.nextReviewAt, now),
      ),
    );
  return rows.map(toGhostProgress);
}

/**
 * Spec 20 "Vacation and Ghosts" — "Vacation Mode freezes Ghost scheduling
 * ... use the same remaining-interval rules used for normal scheduled
 * reviews." The same formula as `domains/progress/repository.ts`'s
 * `applyVacationSchedulingAdjustment`, using `updatedAt` as the anchor for
 * when a Ghost's *current* waiting interval began — the Ghost SRS has no
 * separate "last reviewed" column of its own, but every stage transition
 * (creation, advance, or reset) is itself a row update, and `updatedAt`
 * bumps automatically on every one of those (`$onUpdate`, `db/schema/
 * columns.ts`) — exactly "when did the currently-waiting stage begin,"
 * without a dedicated column.
 *
 * A single `UPDATE ... CASE` rather than a fetch-then-loop, unlike Fluent
 * Mode's toggle-driven `reconcileFluentSchedules`: this runs for every
 * scheduled Ghost across the *entire* account on every vacation-mode end
 * (an unbounded set, the same "avoid N+1" reasoning as the normal-item
 * version), and — unlike Fluent Mode's calendar-month math — this is pure
 * duration arithmetic, which Postgres's `interval` computes identically to
 * this codebase's JS date math, so there's no cross-implementation drift
 * risk to avoid by doing it in JS instead.
 */
/**
 * Spec 20 Danger Zone — Ghost Reviews Reset. "Removes the learner's active/
 * dormant Ghost Review state for that selected content type" — a full row
 * delete, not a field clear, matching the spec's own "removes" language.
 * Never touches `user_item_progress` (the spec's own example: a Vocabulary
 * item stays Master after its Ghost is reset) — this table has no foreign
 * key back to normal SRS state to cascade through.
 */
export async function deleteGhostProgressForContentType(
  db: DbClient,
  userId: string,
  languageId: string,
  contentType: ReviewItemType,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userSentenceGhostProgress)
    .where(
      and(
        eq(userSentenceGhostProgress.userId, userId),
        eq(userSentenceGhostProgress.languageId, languageId),
        eq(userSentenceGhostProgress.contentType, contentType),
      ),
    );
  await db
    .delete(userSentenceGhostProgress)
    .where(
      and(
        eq(userSentenceGhostProgress.userId, userId),
        eq(userSentenceGhostProgress.languageId, languageId),
        eq(userSentenceGhostProgress.contentType, contentType),
      ),
    );
  return row?.value ?? 0;
}

/** Spec 20 Danger Zone — Reset to Level: "removes Ghost state tied to removed progress." */
export async function deleteGhostProgressForLearningItems(db: DbClient, userId: string, learningItemIds: string[]): Promise<void> {
  if (learningItemIds.length === 0) return;
  await db
    .delete(userSentenceGhostProgress)
    .where(and(eq(userSentenceGhostProgress.userId, userId), inArray(userSentenceGhostProgress.learningItemId, learningItemIds)));
}

export async function applyGhostVacationSchedulingAdjustment(db: DbClient, userId: string, vacationStartedAt: Date, vacationEndedAt: Date): Promise<void> {
  const waitStartedAt = userSentenceGhostProgress.updatedAt;

  await db
    .update(userSentenceGhostProgress)
    .set({
      nextReviewAt: sql`CASE
        WHEN ${waitStartedAt} <= ${vacationStartedAt}
          THEN ${userSentenceGhostProgress.nextReviewAt} + (${vacationEndedAt}::timestamptz - ${vacationStartedAt}::timestamptz)
        ELSE ${vacationEndedAt}::timestamptz + (${userSentenceGhostProgress.nextReviewAt} - ${waitStartedAt})
      END`,
    })
    .where(and(eq(userSentenceGhostProgress.userId, userId), isNotNull(userSentenceGhostProgress.nextReviewAt)));
}
