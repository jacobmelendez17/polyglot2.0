import { and, count, eq, inArray, lte, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { learningItems, levels, userItemProgress, userLevelProgress } from "@/db/schema";
import type { SrsStage } from "@/domains/srs";

import type { ItemProgress, LevelProgress } from "./types";

/**
 * Real progress repository (spec 08 §29) — read-oriented only. No
 * `setSrsStage`/`setNextReview`/`setUnlocked` mutation API is exposed here
 * deliberately; authoritative mutations belong to future, approved
 * lesson/review workflows, not general-purpose repository setters. Every
 * function is user-scoped by a required `userId` parameter — a query that
 * could return another user's row when called correctly would be a defect,
 * not a caller-discipline concern (spec §29's own framing).
 *
 * Takes an injected `DbClient`, not the `db` singleton — see
 * `domains/users/user-repository.ts` for why.
 */

type ItemProgressRow = typeof userItemProgress.$inferSelect;
type LevelProgressRow = typeof userLevelProgress.$inferSelect;

function toItemProgress(row: ItemProgressRow): ItemProgress {
  return {
    userId: row.userId,
    learningItemId: row.learningItemId,
    languageId: row.languageId,
    srsStage: row.srsStage,
    learnedAt: row.learnedAt,
    nextReviewAt: row.nextReviewAt,
    fluentAt: row.fluentAt,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    reviewCount: row.reviewCount,
    lastReviewedAt: row.lastReviewedAt,
    version: row.version,
  };
}

function toLevelProgress(row: LevelProgressRow): LevelProgress {
  return { userId: row.userId, levelId: row.levelId, unlockedAt: row.unlockedAt, completedAt: row.completedAt };
}

export async function getItemProgress(
  db: DbClient,
  userId: string,
  learningItemId: string,
): Promise<ItemProgress | null> {
  const [row] = await db
    .select()
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.learningItemId, learningItemId)))
    .limit(1);
  return row ? toItemProgress(row) : null;
}

export async function hasItemProgress(db: DbClient, userId: string, learningItemId: string): Promise<boolean> {
  return (await getItemProgress(db, userId, learningItemId)) !== null;
}

/** Every progress row a user has in one language — the shape the due-review index (`db/schema/progress.ts`) is built for. */
export async function getUserProgressForLanguage(
  db: DbClient,
  userId: string,
  languageId: string,
): Promise<ItemProgress[]> {
  const rows = await db
    .select()
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.languageId, languageId)));
  return rows.map(toItemProgress);
}

/** Items due for review now or earlier, for one user/language — exercises `user_item_progress_due_review_idx`. Items with no scheduled review (`nextReviewAt` null, e.g. Fluent) are never due. */
export async function getDueReviewItems(
  db: DbClient,
  userId: string,
  languageId: string,
  now: Date,
): Promise<ItemProgress[]> {
  const rows = await db
    .select()
    .from(userItemProgress)
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(userItemProgress.languageId, languageId),
        lte(userItemProgress.nextReviewAt, now),
      ),
    );
  return rows.map(toItemProgress);
}

export async function getLevelProgress(db: DbClient, userId: string, levelId: string): Promise<LevelProgress | null> {
  const [row] = await db
    .select()
    .from(userLevelProgress)
    .where(and(eq(userLevelProgress.userId, userId), eq(userLevelProgress.levelId, levelId)))
    .limit(1);
  return row ? toLevelProgress(row) : null;
}

/** Every level a user has unlocked in one language — joins through `levels` since `user_level_progress` has no denormalized `language_id`. */
export async function getUnlockedLevels(db: DbClient, userId: string, languageId: string): Promise<LevelProgress[]> {
  const rows = await db
    .select({ progress: userLevelProgress })
    .from(userLevelProgress)
    .innerJoin(levels, eq(levels.id, userLevelProgress.levelId))
    .where(and(eq(userLevelProgress.userId, userId), eq(levels.languageId, languageId)));
  return rows.map((row) => toLevelProgress(row.progress));
}

/**
 * The following mutation functions exist for real, approved review/lesson
 * completion workflows only (spec 09 unit 4 is the first) — this repository
 * was deliberately read-only until now (see this file's top docstring).
 * They take an injected `DbClient` like every function above; a caller that
 * needs them composed into one atomic transaction with other domains'
 * writes (spec 09 §10 — review-event insertion, idempotency, level unlock,
 * all-or-nothing) passes the same `tx` to each.
 */

/**
 * Locks the row for the duration of the caller's transaction (`SELECT ...
 * FOR UPDATE`) so a concurrent completion of the same item serializes
 * behind this one rather than racing it (spec 09 §11's "use database-level
 * row locking"). Returns `null` if no such row exists, or if it exists but
 * belongs to a different language than expected (spec 09 §10's "validate
 * ownership + language") — both are treated as not-found by the caller.
 * Does **not** itself decide staleness or due-ness — comparing the locked
 * row against the caller's review-session snapshot is spec 09's own
 * business logic (`STALE_REVIEW`/`REVIEW_NOT_DUE`), not a generic
 * progress-repository concern.
 */
export async function lockItemProgressForReview(
  db: DbClient,
  { userId, learningItemId, languageId }: { userId: string; learningItemId: string; languageId: string },
): Promise<ItemProgress | null> {
  const [row] = await db
    .select()
    .from(userItemProgress)
    .where(and(eq(userItemProgress.userId, userId), eq(userItemProgress.learningItemId, learningItemId)))
    .for("update");

  if (!row || row.languageId !== languageId) return null;
  return toItemProgress(row);
}

export type ApplyItemProgressUpdateInput = {
  userId: string;
  learningItemId: string;
  /** Must match the row's current `version` (re-checked here as a final defensive guard on top of the row lock) — a mismatch means it changed between the lock and this call and updates zero rows. */
  expectedVersion: number;
  srsStage: SrsStage;
  nextReviewAt: Date | null;
  /** Pass the row's own current `fluentAt` to preserve it, or `now` only on the call that first reaches Fluent — this function never invents that decision itself. */
  fluentAt: Date | null;
  /** Whether this review's overall result was "advanced" or "penalized" — drives which aggregate counter increments. */
  result: "advanced" | "penalized";
  now: Date;
};

/**
 * Applies one review's outcome to the already-locked row (call after
 * `lockItemProgressForReview` inside the same transaction). Returns `null`
 * if `expectedVersion` no longer matches — should not happen given the row
 * lock, but kept as a defensive guard rather than trusting the lock alone.
 */
export async function applyItemProgressUpdate(
  db: DbClient,
  input: ApplyItemProgressUpdateInput,
): Promise<ItemProgress | null> {
  const [updated] = await db
    .update(userItemProgress)
    .set({
      srsStage: input.srsStage,
      nextReviewAt: input.nextReviewAt,
      fluentAt: input.fluentAt,
      // Only the counter matching this review's actual result increments —
      // the other is omitted entirely (not "set to itself") so it's simply
      // left untouched by this UPDATE.
      ...(input.result === "advanced"
        ? { correctCount: sql`${userItemProgress.correctCount} + 1` }
        : { incorrectCount: sql`${userItemProgress.incorrectCount} + 1` }),
      reviewCount: sql`${userItemProgress.reviewCount} + 1`,
      lastReviewedAt: input.now,
      version: sql`${userItemProgress.version} + 1`,
    })
    .where(
      and(
        eq(userItemProgress.userId, input.userId),
        eq(userItemProgress.learningItemId, input.learningItemId),
        eq(userItemProgress.version, input.expectedVersion),
      ),
    )
    .returning();

  return updated ? toItemProgress(updated) : null;
}

/**
 * The denominator for the level-unlock ratio (spec 09 §15, architecture.md's
 * "Use the actual configured number of SRS-gating items" — never a
 * hardcoded 50). Every `learning_items` row is an SRS-gating item today
 * (only vocabulary/grammar types exist); this will need to exclude a future
 * "intermission" type once one exists, per architecture.md's "Intermissions
 * are not SRS gating items."
 *
 * No new index needed: `learning_items_level_type_position_key`'s leftmost
 * column is already `level_id`.
 */
export async function countLevelGatingItems(db: DbClient, levelId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(learningItems).where(eq(learningItems.levelId, levelId));
  return row?.value ?? 0;
}

/**
 * The numerator: how many of a user's progress rows for items in this
 * level are at or above the unlock threshold stage. `qualifyingStages` is
 * computed by the caller from `SRS_STAGE_ORDER` (never a raw stage-ordinal
 * SQL comparison — architecture.md's invariant).
 *
 * No new index needed: `user_item_progress`'s primary key is already
 * `(user_id, learning_item_id)`, the exact shape this join probes (fixed
 * `user_id`, ranging `learning_item_id` from the level's items).
 */
export async function countUserItemsAtOrAboveStageInLevel(
  db: DbClient,
  { userId, levelId, qualifyingStages }: { userId: string; levelId: string; qualifyingStages: SrsStage[] },
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userItemProgress)
    .innerJoin(learningItems, eq(learningItems.id, userItemProgress.learningItemId))
    .where(
      and(
        eq(userItemProgress.userId, userId),
        eq(learningItems.levelId, levelId),
        inArray(userItemProgress.srsStage, qualifyingStages),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Idempotently persists a level unlock (spec 09 §15 — "make the operation
 * idempotent," "keep the level permanently unlocked afterward"). Safe to
 * call every time the threshold check passes, even if already unlocked —
 * `onConflictDoNothing` plus a reselect, same pattern as
 * `domains/users/user-repository.ts`'s `provisionUser`.
 */
export async function unlockLevel(
  db: DbClient,
  { userId, levelId, now }: { userId: string; levelId: string; now: Date },
): Promise<LevelProgress> {
  await db
    .insert(userLevelProgress)
    .values({ userId, levelId, unlockedAt: now })
    .onConflictDoNothing({ target: [userLevelProgress.userId, userLevelProgress.levelId] });

  const [row] = await db
    .select()
    .from(userLevelProgress)
    .where(and(eq(userLevelProgress.userId, userId), eq(userLevelProgress.levelId, levelId)))
    .limit(1);
  if (!row) {
    throw new Error(`unlockLevel: row for user ${userId} / level ${levelId} missing immediately after upsert — should never happen.`);
  }
  return toLevelProgress(row);
}
