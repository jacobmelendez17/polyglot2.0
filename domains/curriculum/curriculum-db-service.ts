import { db } from "@/db/client";
import { getConfirmedDictionaryDataForItems } from "@/domains/lexicon/server";

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
import type { LearningItem } from "./curriculum-types";

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
 * Merges "everything the dictionary has" (2026-09-07 decision) into a
 * lesson batch's vocabulary items, one batched dictionary query for the
 * whole batch rather than one per item. Composed here — where curriculum's
 * own database-backed layer already reaches into `db` — rather than inside
 * `lesson-curriculum-repository.ts`, which stays curriculum-only per its own
 * docstring; this function is the one place `domains/curriculum` and
 * `domains/lexicon` meet.
 */
async function withConfirmedDictionaryData(items: LearningItem[]): Promise<LearningItem[]> {
  const vocabularyItemIds = items.filter((item): item is Extract<LearningItem, { type: "vocabulary" }> => item.type === "vocabulary").map((item) => item.id);
  if (vocabularyItemIds.length === 0) return items;

  const dictionaryByItemId = await getConfirmedDictionaryDataForItems(vocabularyItemIds);
  if (dictionaryByItemId.size === 0) return items;

  return items.map((item) => {
    if (item.type !== "vocabulary") return item;
    const dictionary = dictionaryByItemId.get(item.id);
    if (!dictionary) return item;

    return {
      ...item,
      ...(dictionary.definition ? { definition: dictionary.definition } : {}),
      pronunciation: {
        ...item.pronunciation,
        ...(dictionary.ipa ? { ipa: dictionary.ipa } : {}),
      },
      dictionary: {
        lemma: dictionary.lemma,
        synonyms: dictionary.synonyms,
        variants: dictionary.variants,
        usageLabels: dictionary.usageLabels,
        regionalEvidence: dictionary.regionalEvidence.map((evidence) => ({
          regionCode: evidence.regionCode,
          status: evidence.status,
          matchedForm: evidence.matchedForm,
        })),
        attributionText: dictionary.attribution?.attributionText ?? null,
      },
    };
  });
}

/**
 * The real, database-backed `LessonCurriculumReader` (spec 07 unit 6).
 * `domains/lessons` receives this object; the fixture equivalent in
 * `curriculum-service.ts` is what its unit tests receive instead. Both
 * satisfy the same port, so the orchestration code is identical either way.
 */
export const databaseCurriculumReader = {
  getEligibleLearningItems: async (userId: string, languageId: string) => withConfirmedDictionaryData(await getEligibleLessonItems(db, userId, languageId)),
  getLearningItemsByIds: async (ids: string[]) => withConfirmedDictionaryData(await getLessonItemsByIds(db, ids)),
};
