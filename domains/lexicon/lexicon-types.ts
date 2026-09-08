/**
 * Spec 12 — public domain types for the Lexicon domain.
 *
 * These are Polyglot's own vocabulary for lexical data, deliberately free of
 * any provider's terminology: nothing here says "wiktionary", "kaikki", or
 * "hunspell". Provider-shaped structures live behind the import adapters
 * (`./import/`), and generic application code never sees them.
 *
 * The string-literal unions below mirror the Postgres enums in
 * `db/schema/lexicon.ts` value-for-value (lowercase `snake_case`); spec 12
 * writes the same states in uppercase prose.
 */

export type LexicalSourceType = "dictionary" | "regional_wordlist";

export type LexicalImportScope = "curriculum" | "terms" | "full_language";

export type LexicalImportStatus = "staged" | "validating" | "completed" | "failed" | "rolled_back";

export type DictionarySourceStatus = "active" | "missing_from_source";

export type DictionaryMatchStatus =
  | "unmatched"
  | "source_data_not_imported"
  | "auto_matched"
  | "review_required"
  | "manual";

export type DictionaryMatchConfidence = "high" | "medium" | "low";

export type DictionaryRelationType =
  | "synonym"
  | "antonym"
  | "related"
  | "alternative_form"
  | "form_of"
  | "derived"
  | "hypernym"
  | "hyponym";

export type RegionalEvidenceStatus = "recognized" | "not_listed" | "unknown";

/**
 * Why a mapping needs an admin decision. A closed set rather than free text:
 * the Admin review queue filters on it, and a typo'd reason would silently
 * create an invisible category (the same reasoning behind
 * `ADMIN_AUDIT_ACTIONS`).
 */
export const MAPPING_REVIEW_REASONS = [
  "multiple_candidates",
  "part_of_speech_conflict",
  "phrase_ambiguity",
  "selected_sense_missing",
  "entry_missing_from_source",
  "regional_mismatch",
] as const;

export type MappingReviewReason = (typeof MAPPING_REVIEW_REASONS)[number];

export interface LexicalSource {
  id: string;
  code: string;
  provider: string;
  sourceType: LexicalSourceType;
  sourceLanguage: string;
  entryLanguage: string | null;
  licenseMetadata: Record<string, unknown>;
  attributionText: string;
}

export interface LexicalImport {
  id: string;
  sourceId: string;
  scope: LexicalImportScope;
  status: LexicalImportStatus;
  sourceVersion: string | null;
  dumpDate: Date | null;
  extractorVersion: string | null;
  sourceCommit: string | null;
  fileChecksum: string;
  recordsScanned: number;
  recordsRetained: number;
  recordsRejected: number;
  entriesCreated: number;
  entriesUpdated: number;
  startedAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
}

export interface DictionarySense {
  id: string;
  senseOrder: number;
  gloss: string;
  tags: string[];
  topics: string[];
  sourceStatus: DictionarySourceStatus;
}

export interface DictionaryForm {
  id: string;
  form: string;
  tags: string[];
  sourceStatus: DictionarySourceStatus;
}

export interface DictionaryPronunciation {
  id: string;
  ipa: string | null;
  regionCode: string | null;
  tags: string[];
  audioUrl: string | null;
  sourceStatus: DictionarySourceStatus;
}

export interface DictionaryRelation {
  id: string;
  relationType: DictionaryRelationType;
  targetLemma: string;
  targetDictionaryEntryId: string | null;
  sourceStatus: DictionarySourceStatus;
}

export interface RegionalEvidence {
  regionCode: string;
  status: RegionalEvidenceStatus;
  matchedForm: string | null;
  evaluatedAt: Date;
}

export interface DictionaryEntrySummary {
  id: string;
  languageId: string;
  sourceId: string;
  lemma: string;
  normalizedLemma: string;
  partOfSpeech: string;
  sourceEntryKey: string;
  sourceStatus: DictionarySourceStatus;
}

/** A full dictionary entry with everything Polyglot projects relationally. Never carries `raw_data`. */
export interface DictionaryEntryDetail extends DictionaryEntrySummary {
  senses: DictionarySense[];
  forms: DictionaryForm[];
  pronunciations: DictionaryPronunciation[];
  relations: DictionaryRelation[];
  regionalEvidence: RegionalEvidence[];
}

export interface VocabularyDictionaryMapping {
  id: string;
  vocabularyItemId: string;
  dictionaryEntryId: string | null;
  lookupForm: string;
  matchStatus: DictionaryMatchStatus;
  confidence: DictionaryMatchConfidence | null;
  manualLock: boolean;
  preferredPronunciationId: string | null;
  reviewReason: MappingReviewReason | null;
  mappedByUserId: string | null;
  mappedAt: Date | null;
}

/** Attribution that must travel with any surfaced dictionary content (spec 12 "Licensing and Attribution"). */
export interface LexicalAttribution {
  sourceCode: string;
  provider: string;
  attributionText: string;
  sourceVersion: string | null;
}

/**
 * Everything the dictionary has for one item's *confirmed* mapping,
 * batch-loaded for a whole lesson (2026-09-07 decision — see
 * `resolveVocabularyPresentation`'s docstring for the "confirmed mapping
 * wins" rule this also implements). Present in a lesson batch's lookup map
 * only for items with `matchStatus === "manual"`; everything else falls
 * back to the curriculum's own fields.
 */
export interface ConfirmedLessonDictionaryData {
  lemma: string;
  /** The primary selected sense's gloss — the resolved teaching definition. `null` if nothing is selected. */
  definition: string | null;
  ipa: string | null;
  synonyms: string[];
  variants: string[];
  usageLabels: string[];
  regionalEvidence: RegionalEvidence[];
  attribution: LexicalAttribution | null;
}
