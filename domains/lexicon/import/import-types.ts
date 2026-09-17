import type {
  DictionaryRelationType,
  LexicalImportScope,
} from "../lexicon-types";

/**
 * Provider-neutral shape every dictionary adapter produces. The importer and
 * the repository only ever see this — nothing downstream of an adapter knows
 * whether the bytes came from Wiktextract, JMdict, or anything else.
 */

export interface ProjectedSense {
  sourceSenseKey: string;
  sourceFingerprint: string;
  senseOrder: number;
  gloss: string;
  tags: string[];
  topics: string[];
}

export interface ProjectedForm {
  form: string;
  normalizedForm: string;
  tags: string[];
  sourceFingerprint: string;
}

export interface ProjectedPronunciation {
  ipa: string | null;
  regionCode: string | null;
  tags: string[];
  audioUrl: string | null;
  sourceFingerprint: string;
}

export interface ProjectedRelation {
  relationType: DictionaryRelationType;
  targetLemma: string;
  normalizedTargetLemma: string;
}

export interface ProjectedDictionaryRecord {
  sourceEntryKey: string;
  lemma: string;
  normalizedLemma: string;
  /** Polyglot's normalized POS. Records whose POS can't be normalized are rejected rather than stored with a raw upstream tag. */
  partOfSpeech: string;
  languageCode: string;
  senses: ProjectedSense[];
  forms: ProjectedForm[];
  pronunciations: ProjectedPronunciation[];
  relations: ProjectedRelation[];
  /** Regions the source explicitly restricts this entry to, derived from its own usage labels. Usually empty. */
  restrictedRegionCodes: string[];
  /** The complete upstream object, retained verbatim in `dictionary_entry_versions.raw_data`. */
  rawData: unknown;
  sourceHash: string;
}

/** Every normalized form this record can be reached by — its lemma plus each of its forms. Used for scope filtering. */
export function reachableForms(record: ProjectedDictionaryRecord): string[] {
  return [
    record.normalizedLemma,
    ...record.forms.map((form) => form.normalizedForm),
  ];
}

export interface ImportScopeFilter {
  scope: LexicalImportScope;
  /** Normalized forms to retain. Empty and unused when `scope` is `full_language`. */
  wantedForms: ReadonlySet<string>;
}

export interface ImportCounters {
  recordsScanned: number;
  recordsRetained: number;
  recordsRejected: number;
  entriesCreated: number;
  entriesUpdated: number;
}
