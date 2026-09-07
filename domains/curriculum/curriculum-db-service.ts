import { db } from "@/db/client";

import * as adminRepository from "./curriculum-admin-repository";
import {
  getAcceptedAnswers as repoGetAcceptedAnswers,
  getDraft as repoGetDraft,
  getLevelValidationCounts as repoGetLevelValidationCounts,
} from "./curriculum-mutation-repository";
import { getEligibleLessonItems, getLessonItemsByIds } from "./lesson-curriculum-repository";
import * as repository from "./curriculum-repository";
import type { CurriculumVisibility } from "./curriculum-repository";
import type { GetAdminCurriculumItemsInput } from "./curriculum-admin-types";

/**
 * Binds the real app database to the injectable repository (spec 08 §30).
 * Not guarded with `import "server-only"` directly — importing `db` from
 * `db/client.ts` already carries that guard transitively, matching
 * `domains/users/user-service.ts`'s precedent.
 */
export async function getLanguageByCode(code: string) {
  return repository.getLanguageByCode(db, code);
}

export async function getLanguageById(id: string) {
  return repository.getLanguageById(db, id);
}

export async function getLevelById(levelId: string) {
  return repository.getLevelById(db, levelId);
}

export async function getLevelsByLanguage(languageId: string) {
  return repository.getLevelsByLanguage(db, languageId);
}

export async function getLevelByLanguageAndNumber(languageId: string, levelNumber: number, options?: CurriculumVisibility) {
  return repository.getLevelByLanguageAndNumber(db, languageId, levelNumber, options);
}

export async function getVocabularyGroup(id: string) {
  return repository.getVocabularyGroup(db, id);
}

export async function getVocabularyGroupsByLanguage(languageId: string) {
  return repository.getVocabularyGroupsByLanguage(db, languageId);
}

export async function getLearningItem(id: string) {
  return repository.getLearningItem(db, id);
}

export async function getLearningItemsByIds(ids: string[]) {
  return repository.getLearningItemsByIds(db, ids);
}

export async function getLearningItemExamples(learningItemId: string) {
  return repository.getLearningItemExamples(db, learningItemId);
}

export async function getLevelItems(levelId: string, options?: CurriculumVisibility) {
  return repository.getLevelItems(db, levelId, options);
}

export async function getLanguages() {
  return repository.getLanguages(db);
}

export async function getAdminCurriculumItems(input: GetAdminCurriculumItemsInput) {
  return adminRepository.getAdminCurriculumItems(db, input);
}

export async function getAdminCurriculumStatusCounts(languageId: string) {
  return adminRepository.getAdminCurriculumStatusCounts(db, languageId);
}

export async function getAcceptedAnswers(learningItemId: string) {
  return repoGetAcceptedAnswers(db, learningItemId);
}

export async function getItemDraft(learningItemId: string) {
  return repoGetDraft(db, learningItemId);
}

export async function getLevelValidationCounts(levelId: string) {
  return repoGetLevelValidationCounts(db, levelId);
}

/**
 * The real, database-backed `LessonCurriculumReader` (spec 07 unit 6).
 * `domains/lessons` receives this object; the fixture equivalent in
 * `curriculum-service.ts` is what its unit tests receive instead. Both
 * satisfy the same port, so the orchestration code is identical either way.
 */
export const databaseCurriculumReader = {
  getEligibleLearningItems: (userId: string, languageId: string) => getEligibleLessonItems(db, userId, languageId),
  getLearningItemsByIds: (ids: string[]) => getLessonItemsByIds(db, ids),
};
