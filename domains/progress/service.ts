import { db } from "@/db/client";

import * as repository from "./repository";

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

export async function getUserProgressForLanguage(userId: string, languageId: string) {
  return repository.getUserProgressForLanguage(db, userId, languageId);
}

export async function getDueReviewItems(userId: string, languageId: string, now: Date) {
  return repository.getDueReviewItems(db, userId, languageId, now);
}

export async function getLevelProgress(userId: string, levelId: string) {
  return repository.getLevelProgress(db, userId, levelId);
}

export async function getUnlockedLevels(userId: string, languageId: string) {
  return repository.getUnlockedLevels(db, userId, languageId);
}
