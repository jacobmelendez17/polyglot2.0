/**
 * Client-safe public surface for `domains/lexicon` (spec 12).
 *
 * Everything here is pure and database-free — normalization, the language
 * provider, the matching algorithm, display labels, and types. A
 * `"use client"` component may value-import from this barrel.
 *
 * Anything that reaches Drizzle lives in `./server.ts` instead. This split is
 * not stylistic: a client component that value-imports a barrel pulls in that
 * barrel's entire module graph, which is how server secrets briefly leaked
 * into the browser bundle in spec 07 (see progress-tracker.md's Architecture
 * Decisions and Environment Notes).
 */

export {
  normalizeLexicalForm,
  normalizePartOfSpeech,
  isMultiwordForm,
} from "./lexical-normalization";
export {
  composeVocabularyDisplayWord,
  defaultLexicalProvider,
  getLexicalLanguageProvider,
  spanishLexicalProvider,
} from "./lexical-language-provider";
export { baseLanguageSubtag } from "@/lib/language-code";
export type {
  GrammaticalGender,
  LexicalLanguageProvider,
} from "./lexical-language-provider";

export { resolveDictionaryMatch } from "./lexicon-matching";
export type {
  DictionaryMatchCandidate,
  DictionaryMatchResolution,
  ResolveDictionaryMatchInput,
} from "./lexicon-matching";

export {
  MATCH_CONFIDENCE_LABELS,
  MATCH_STATUS_LABELS,
  NOT_LISTED_CAVEAT,
  REGIONAL_STATUS_LABELS,
  REVIEW_REASON_LABELS,
} from "./lexicon-labels";

export {
  LEXICAL_SOURCE_DEFINITIONS,
  RLA_ES_MX_SOURCE_CODE,
  RLA_ES_SOURCE_CODE,
  WIKTIONARY_ES_SOURCE_CODE,
  getDictionarySourceCodeForLanguage,
  getRegionalSourceCodeForRegion,
} from "./lexical-source-registry";
export type { LexicalSourceDefinition } from "./lexical-source-registry";

export { MAPPING_REVIEW_REASONS } from "./lexicon-types";
export type {
  ConfirmedLessonDictionaryData,
  DictionaryEntryDetail,
  DictionaryEntrySummary,
  DictionaryForm,
  DictionaryMatchConfidence,
  DictionaryMatchStatus,
  DictionaryPronunciation,
  DictionaryRelation,
  DictionaryRelationType,
  DictionarySense,
  DictionarySourceStatus,
  LexicalAttribution,
  LexicalImport,
  LexicalImportScope,
  LexicalImportStatus,
  LexicalSource,
  LexicalSourceType,
  MappingReviewReason,
  RegionalEvidence,
  RegionalEvidenceStatus,
  VocabularyDictionaryMapping,
} from "./lexicon-types";

export {
  deriveDictionaryRelationAnswers,
  resolveConfirmedDictionaryFields,
  resolveVocabularyPresentation,
} from "./lexicon-read-model";
export type {
  ResolvedVocabularyPresentation,
  VocabularyDetail,
  VocabularyDetailCurriculum,
  VocabularyDetailDictionary,
} from "./lexicon-read-model";
export type {
  MappingQueueFilters,
  MappingQueuePage,
  MappingQueueRow,
} from "./lexicon-repository";
