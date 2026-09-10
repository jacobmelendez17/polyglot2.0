export { getEligibleLearningItems, getLearningItemsByIds } from "./curriculum-service";
export { FIXTURE_LANGUAGE_ID, FIXTURE_LEARNING_ITEMS } from "./curriculum-fixtures";
export type {
  CurriculumExample,
  CurriculumResource,
  GrammarItem,
  GrammarQuestionDirection,
  LearningItem,
  Pronunciation,
  VocabularyDictionaryInfo,
  VocabularyItem,
  VocabularyTheme,
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
  CurriculumExampleSentence,
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

// Spec 13's bulk vocabulary import — column contract, size limits, and
// row-shape validation, pure and database-free. `parseVocabularyImportFile`
// itself (the one thing here that touches `csv-parse`) is deliberately
// *not* exported from this barrel — see `vocabulary-import-file-parser.ts`'s
// own docstring for why a Node-oriented parsing library stays out of the
// client-safe surface.
export {
  GRAMMAR_GROUP_NUMBER,
  IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MAX_VOCABULARY_GROUP_NUMBER,
  REQUIRED_IMPORT_COLUMNS,
  validateVocabularyImportRow,
} from "./vocabulary-import-parsing";
export type {
  ImportDelimiter,
  ImportFileParseError,
  ImportFileParseResult,
  ImportRowFieldIssue,
  ParsedGrammarFields,
  ParsedImportFields,
  ParsedVocabularyFields,
  RawVocabularyImportRow,
  ValidatedImportRow,
} from "./vocabulary-import-parsing";

// Spec 18 — the shared item-detail presentation model. Pure and
// database-free (same rule as `level-view.ts` above), so the shared item
// components — several of which are `"use client"` for scroll tracking and
// tabs — can value-import the builders and label maps directly.
export {
  buildItemDetailView,
  buildItemNavigation,
  EMPTY_FIELD,
  GENDER_LABELS,
  GENERAL_PATTERN_ID,
  ITEM_DETAIL_SECTION_LABELS,
  itemDetailSections,
  NOT_APPLICABLE_FIELD,
  REGISTER_LABELS,
} from "./item-detail-view";
export type {
  GrammarContentBlockSource,
  ItemDetailAboutView,
  ItemDetailAnswerListView,
  ItemDetailExampleSource,
  ItemDetailExampleView,
  ItemDetailField,
  ItemDetailMode,
  ItemDetailPatternSource,
  ItemDetailPatternView,
  ItemDetailPronunciationView,
  ItemDetailResourceSource,
  ItemDetailSectionId,
  ItemDetailSenseSource,
  ItemDetailSource,
  ItemDetailType,
  ItemDetailView,
  ItemNavigationView,
} from "./item-detail-view";
export type { CurriculumGrammarContentBlock, CurriculumItemResource } from "./curriculum-db-types";
