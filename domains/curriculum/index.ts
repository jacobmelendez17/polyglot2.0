export { getEligibleLearningItems, getLearningItemsByIds } from "./curriculum-service";
export { FIXTURE_LANGUAGE_ID, FIXTURE_LEARNING_ITEMS } from "./curriculum-fixtures";
export type {
  CurriculumExample,
  CurriculumResource,
  GrammarItem,
  GrammarQuestionDirection,
  LearningItem,
  Pronunciation,
  VocabularyItem,
} from "./curriculum-types";

// Real, database-backed curriculum foundation (spec 08 §30) — additive
// alongside the fixture exports above, which `domains/lessons` still
// consumes unchanged. See progress-tracker.md for why this wasn't a swap.
// The functions themselves (`getLanguageByCode`, etc.) live in
// `./server.ts`, not here — this barrel is value-imported by a real client
// component (`components/lessons/lesson-session-view.tsx`, for
// `FIXTURE_LANGUAGE_ID`), and adding a value export that transitively
// imports `db/client.ts` here would leak the database client into that
// component's browser bundle, the same bug already fixed once in
// `domains/lessons` — see progress-tracker.md's Architecture Decisions.
// Types are safe here (`import type` is always erased).
export type {
  CurriculumGrammarDetail,
  CurriculumLanguage,
  CurriculumLearningItem,
  CurriculumLevel,
  CurriculumStatus,
  CurriculumVocabularyDetail,
  CurriculumVocabularyGroup,
} from "./curriculum-db-types";
export type {
  AdminCurriculumFilters,
  AdminCurriculumItemsPage,
  AdminCurriculumListItem,
  AdminCurriculumStatusCounts,
  GetAdminCurriculumItemsInput,
} from "./curriculum-admin-types";
export type {
  AcceptedAnswerInput,
  ArchiveLearningItemInput,
  BulkArchiveLearningItemsInput,
  BulkMoveLearningItemsInput,
  BulkPublishPendingItemsInput,
  CreateLearningItemInput,
  CreateLevelInput,
  CreateVocabularyGroupInput,
  DeleteLearningItemInput,
  DeleteLearningItemResult,
  DuplicateCandidate,
  GrammarFieldsInput,
  MoveLearningItemInput,
  PublishLearningItemInput,
  ReorderLearningItemsInput,
  ReorderVocabularyGroupsInput,
  UpdateLearningItemInput,
  UpdateLevelInput,
  UpdateVocabularyGroupInput,
  VocabularyFieldsInput,
} from "./curriculum-mutation-types";

// Spec 10 — pure, database-free (no db/client.ts import, safe for a "use
// client" component to value-import) level-page transforms.
export { LEVEL_NUMBER_MAX, LEVEL_NUMBER_MIN, buildLevelViewModel, parseLevelNumber } from "./level-view";
export type { LevelCardItem, LevelViewModel } from "./level-view";

// Spec 11 rewrite's Levels Management validation display — pure, database-free.
export {
  CURRICULUM_VALIDATION_CONFIG,
  evaluateLevelValidation,
  resolveLevelValidationTargets,
} from "./curriculum-validation-config";
export type { LevelValidationCounts, LevelValidationResult, LevelValidationTargets } from "./curriculum-validation-config";
