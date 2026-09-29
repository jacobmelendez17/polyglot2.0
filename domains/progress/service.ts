import { db } from "@/db/client";
import { isVacationModeActive } from "@/domains/users/server";
import {
  getStageIndex,
  LEVEL_UNLOCK_MINIMUM_STAGE,
  SRS_STAGE_ORDER,
} from "@/domains/srs";

import * as repository from "./repository";
import type { LevelUnlockBreakdown } from "./types";

/**
 * Binds the real app database to the injectable repository (spec 08 §29).
 * Not guarded with `import "server-only"` directly — importing `db` from
 * `db/client.ts` already carries that guard transitively.
 */
export async function getItemProgress(userId: string, learningItemId: string) {
  return repository.getItemProgress(db, userId, learningItemId);
}

export async function hasItemProgress(userId: string, learningItemId: string) {
  return repository.hasItemProgress(db, userId, learningItemId);
}

export async function getUserProgressForLanguage(
  userId: string,
  languageId: string,
) {
  return repository.getUserProgressForLanguage(db, userId, languageId);
}

/**
 * Spec 20 General — Vacation Mode: "normal review availability is paused"
 * and "there is no separate 'overdue' state" while active. Resolved here,
 * at the real-database binding, the same way unit 6's NSFW preference is —
 * `domains/srs`'s review session and the dashboard's due-count both call
 * this one function, so neither needs its own vacation check.
 */
export async function getDueReviewItems(
  userId: string,
  languageId: string,
  now: Date,
) {
  if (await isVacationModeActive(userId)) return [];
  return repository.getDueReviewItems(db, userId, languageId, now);
}

export async function getNextUpcomingReviewAt(
  userId: string,
  languageId: string,
  now: Date,
) {
  return repository.getNextUpcomingReviewAt(db, userId, languageId, now);
}

export async function getUpcomingReviewForecast(
  userId: string,
  languageId: string,
  window: { after: Date; until: Date },
) {
  return repository.getUpcomingReviewForecast(db, userId, languageId, window);
}

export async function countProgressForItems(
  userId: string,
  learningItemIds: string[],
) {
  return repository.countProgressForItems(db, userId, learningItemIds);
}

export async function getLevelProgress(userId: string, levelId: string) {
  return repository.getLevelProgress(db, userId, levelId);
}

export async function getUnlockedLevels(userId: string, languageId: string) {
  return repository.getUnlockedLevels(db, userId, languageId);
}

export async function getProgressForItems(
  userId: string,
  learningItemIds: string[],
) {
  return repository.getProgressForItems(db, userId, learningItemIds);
}

/**
 * Spec 26's Level page progress panel: Grammar and Vocabulary counted
 * separately toward the same real unlock threshold
 * (`LEVEL_UNLOCK_RATIO`/`LEVEL_UNLOCK_MINIMUM_STAGE`) the authoritative
 * unlock check uses — never a display-only approximation of that ratio.
 * The authoritative unlock check itself (`review-completion.ts`) is
 * untouched and still counts the whole level in one combined ratio; this is
 * a read model for display, not a second unlock decision.
 */
export async function getLevelUnlockBreakdown(
  userId: string,
  levelId: string,
): Promise<LevelUnlockBreakdown> {
  const qualifyingStages = SRS_STAGE_ORDER.slice(
    getStageIndex(LEVEL_UNLOCK_MINIMUM_STAGE),
  );

  const [grammarTotal, grammarQualifying, vocabularyTotal, vocabularyQualifying] =
    await Promise.all([
      repository.countLevelGatingItems(db, levelId, "grammar"),
      repository.countUserItemsAtOrAboveStageInLevel(db, {
        userId,
        levelId,
        qualifyingStages,
        itemType: "grammar",
      }),
      repository.countLevelGatingItems(db, levelId, "vocabulary"),
      repository.countUserItemsAtOrAboveStageInLevel(db, {
        userId,
        levelId,
        qualifyingStages,
        itemType: "vocabulary",
      }),
    ]);

  return {
    grammar: { qualifying: grammarQualifying, total: grammarTotal },
    vocabulary: { qualifying: vocabularyQualifying, total: vocabularyTotal },
  };
}
