import { db } from "@/db/client";

import * as repository from "./curriculum-repository";

/**
 * Binds the real app database to the injectable repository (spec 08 §30).
 * Not guarded with `import "server-only"` directly — importing `db` from
 * `db/client.ts` already carries that guard transitively, matching
 * `domains/users/user-service.ts`'s precedent.
 */
export async function getLanguageByCode(code: string) {
  return repository.getLanguageByCode(db, code);
}

export async function getLevelById(levelId: string) {
  return repository.getLevelById(db, levelId);
}

export async function getLevelsByLanguage(languageId: string) {
  return repository.getLevelsByLanguage(db, languageId);
}

export async function getVocabularyGroup(id: string) {
  return repository.getVocabularyGroup(db, id);
}

export async function getLearningItem(id: string) {
  return repository.getLearningItem(db, id);
}

export async function getLevelItems(levelId: string) {
  return repository.getLevelItems(db, levelId);
}
