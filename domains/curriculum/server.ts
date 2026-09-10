/**
 * Server-only entry point for the real, database-backed half of
 * `domains/curriculum` (spec 08 §30). `./curriculum-db-service.ts`
 * transitively imports `db/client.ts`. Import from here only in
 * server-only files — never from a `"use client"` component. See
 * `index.ts`'s docstring and `domains/lessons/server.ts` for why this split
 * exists; `components/lessons/lesson-session-view.tsx` already
 * value-imports `FIXTURE_LANGUAGE_ID` from `index.ts`, so that barrel must
 * stay free of anything that reaches the database client.
 */
export { databaseCurriculumReader } from "./curriculum-db-service";
export {
  getAcceptedAnswers,
  getAdminCurriculumItems,
  getAdminCurriculumStatusCounts,
  getItemDraft,
  getLanguageByCode,
  getLanguageById,
  getLanguages,
  getLearningItem,
  getLearningItemExamples,
  getLearningItemsByIds,
  getLevelById,
  getLevelByLanguageAndNumber,
  getLevelItems,
  getLevelsByLanguage,
  getLevelContentCounts,
  getGrammarContentBlocks,
  getItemExamples,
  getItemResources,
  getReviewQueue,
  getUsageContexts,
  getVocabularyGroup,
  getVocabularyGroupsByLanguage,
} from "./curriculum-db-service";

// Spec 18 — the composed item-detail read model. Server-only: it reaches
// `domains/lexicon/server`, `domains/progress/server`, and
// `domains/learner-content/server`, all of which touch the database.
export { getItemDetailPageData } from "./item-detail-service";
export type { ItemDetailPageData } from "./item-detail-service";
