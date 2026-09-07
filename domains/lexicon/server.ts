/**
 * Server-only entry point for `domains/lexicon`. `./lexicon-service.ts`
 * imports `db/client.ts` and the rate-limit provider, both of which carry
 * `server-only` guards — import from here only in server-only files, never
 * from a `"use client"` component. `./index.ts` stays safe to value-import
 * anywhere (pure matching, normalization, labels, and types).
 */
export {
  confirmVocabularyMapping,
  getDictionaryEntryDetail,
  getEntryRawVersions,
  getMappingQueue,
  getMappingStatusCounts,
  getRegionalEvidence,
  getSelectedSenseIds,
  getVocabularyDetail,
  getVocabularyMapping,
  getVocabularyMappingView,
  rematchVocabularyItem,
  searchDictionary,
  selectPreferredPronunciation,
  selectVocabularySenses,
  setVocabularyDictionaryEntry,
} from "./lexicon-service";

export type { VocabularyMappingView } from "./lexicon-service";

export type {
  ConfirmMappingInput,
  MappingQueueInput,
  RematchVocabularyItemInput,
  SearchDictionaryInput,
  SelectPronunciationInput,
  SelectSensesInput,
  SetManualMappingInput,
} from "./lexicon-schemas";
