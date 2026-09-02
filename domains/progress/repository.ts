import { and, eq, lte } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { levels, userItemProgress, userLevelProgress } from "@/db/schema";

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
