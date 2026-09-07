import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./columns";
import { vocabularyItems } from "./curriculum";
import { languages } from "./languages";
import { users } from "./users";

/**
 * Spec 12 — the Lexicon domain's persistence layer: external lexical
 * sources, their imports, the dictionary projection those imports produce,
 * and the mapping from Polyglot curriculum vocabulary onto it.
 *
 * Two rules shape every table here:
 *
 * 1. **Curriculum stays authoritative.** Nothing in this file may be
 *    written by an import in a way that changes a Level, group, SRS state,
 *    learner progress, official translation, or publication state — those
 *    all live in `curriculum.ts`/`progress.ts` and are never referenced by
 *    an importer. The single point of contact is
 *    `vocabulary_dictionary_mappings`, which points *at* a vocabulary item
 *    and never mutates it.
 * 2. **Provider-agnostic.** No `wiktionary_id`/`rla_data`-style
 *    provider-specific column exists anywhere; provider identity lives in
 *    `lexical_sources` and provider-shaped payloads live in the `raw_data`/
 *    `source_data` JSONB columns. Adding JMdict later means adding a row to
 *    `lexical_sources` and an adapter, not a migration.
 *
 * Enum values are lowercase `snake_case`, matching every other enum in this
 * schema (`curriculum_status`, `srs_stage`, `review_result`, …) and
 * code-standards.md's PostgreSQL naming rule. Spec 12 writes these states in
 * uppercase prose (`AUTO_MATCHED`, `REVIEW_REQUIRED`, `RECOGNIZED`, …); they
 * map one-to-one onto the values below, and the Admin UI renders its own
 * human labels rather than either spelling.
 */

/** What kind of resource a source provides: full dictionary entries, or a regional word list used only as evidence. */
export const lexicalSourceTypeEnum = pgEnum("lexical_source_type", ["dictionary", "regional_wordlist"]);

/** Spec 12 "Import Scope". `curriculum` is the default: retain only entries the existing curriculum actually needs. */
export const lexicalImportScopeEnum = pgEnum("lexical_import_scope", ["curriculum", "terms", "full_language"]);

/**
 * Spec 12 "Rollback": an import is only current once it reaches `completed`.
 * `staged` and `validating` rows exist while work is in flight; `failed` and
 * `rolled_back` rows are retained so the last valid projection is traceable.
 */
export const lexicalImportStatusEnum = pgEnum("lexical_import_status", [
  "staged",
  "validating",
  "completed",
  "failed",
  "rolled_back",
]);

/**
 * Spec 12 "Removed Entries and Senses". A record that disappears upstream is
 * marked, never deleted — Polyglot may already reference it.
 */
export const dictionarySourceStatusEnum = pgEnum("dictionary_source_status", ["active", "missing_from_source"]);

/**
 * Spec 12 "Mapping States". `source_data_not_imported` is the fifth value the
 * spec requires be distinguishable from `unmatched`: "no suitable entry
 * exists" and "we never imported the data to look in" are different facts
 * and lead to different admin actions.
 */
export const dictionaryMatchStatusEnum = pgEnum("dictionary_match_status", [
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "review_required",
  "manual",
]);

/** Spec 12 "Matching Algorithm" — categorical, never a fabricated percentage. */
export const dictionaryMatchConfidenceEnum = pgEnum("dictionary_match_confidence", ["high", "medium", "low"]);

/** Spec 12 "Forms, Pronunciations, and Relationships" — the exact relation list the spec enumerates. */
export const dictionaryRelationTypeEnum = pgEnum("dictionary_relation_type", [
  "synonym",
  "antonym",
  "related",
  "alternative_form",
  "form_of",
  "derived",
  "hypernym",
  "hyponym",
]);

/**
 * Spec 12 "RLA-ES". `not_listed` deliberately does not mean "invalid in this
 * region" — absence from a word list is weak evidence, not proof, which is
 * exactly why this is a three-value evidence enum and not a boolean.
 */
export const regionalEvidenceStatusEnum = pgEnum("regional_evidence_status", ["recognized", "not_listed", "unknown"]);

/**
 * One external lexical provider/dataset. Deliberately not scoped to Spanish:
 * `source_language` (the language of the headwords) and `entry_language`
 * (the language the glosses are written in) are plain BCP-47-ish codes, so
 * `wiktionary-en-es`, `rla-es-mx`, and a future `jmdict-en-ja` are the same
 * shape of row.
 *
 * `license_metadata`/`attribution_text` are NOT NULL because spec 12's
 * licensing section makes attribution a structural requirement — a source
 * whose license is unknown must not be silently importable.
 */
export const lexicalSources = pgTable("lexical_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable human-readable identifier, e.g. "wiktionary-en-es", "rla-es-mx". Referenced by config and scripts, never a UUID. */
  code: text("code").notNull().unique(),
  /** The upstream project, e.g. "wiktextract", "rla-es". */
  provider: text("provider").notNull(),
  sourceType: lexicalSourceTypeEnum("source_type").notNull(),
  /** Language of the headwords this source describes, e.g. "es". */
  sourceLanguage: text("source_language").notNull(),
  /** Language the definitions/glosses are written in, e.g. "en". Null for a word list that carries no glosses. */
  entryLanguage: text("entry_language"),
  licenseMetadata: jsonb("license_metadata").$type<Record<string, unknown>>().notNull(),
  attributionText: text("attribution_text").notNull(),
  ...timestamps(),
});

/**
 * One snapshot of one source being ingested (spec 12 "Import Versioning").
 * Every projection row records which import first and last saw it, so a
 * reimport can mark what vanished without deleting anything, and a bad
 * release is traceable to the exact snapshot that introduced it.
 *
 * `(source_id, file_checksum)` is unique: re-running the importer over the
 * byte-identical dump is a no-op rather than a second pass that duplicates
 * lexical records, which is spec 12's idempotency requirement enforced at
 * the database rather than trusted to the script.
 */
export const lexicalImports = pgTable(
  "lexical_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => lexicalSources.id, { onDelete: "restrict" }),
    scope: lexicalImportScopeEnum("scope").notNull(),
    status: lexicalImportStatusEnum("status").notNull().default("staged"),
    /** Upstream release identifier, e.g. a Kaikki dump tag. */
    sourceVersion: text("source_version"),
    dumpDate: timestamp("dump_date", { withTimezone: true }),
    extractorVersion: text("extractor_version"),
    /** Upstream commit/revision, where the source exposes one. */
    sourceCommit: text("source_commit"),
    /** SHA-256 of the input file. */
    fileChecksum: text("file_checksum").notNull(),
    /**
     * What subset of the snapshot this import asked for, as a stable digest.
     * `curriculum`/`full_language` use the scope name itself; a `terms`
     * import folds its term list into the value, since two `terms` runs over
     * the same file with different lists are genuinely different imports.
     *
     * Part of the idempotency key together with `file_checksum`: re-running
     * the identical snapshot at the identical scope is a no-op, while
     * widening `curriculum` to `full_language` over the same dump is a real
     * import and must be allowed to proceed.
     */
    scopeKey: text("scope_key").notNull(),
    recordsScanned: integer("records_scanned").notNull().default(0),
    recordsRetained: integer("records_retained").notNull().default(0),
    recordsRejected: integer("records_rejected").notNull().default(0),
    entriesCreated: integer("entries_created").notNull().default(0),
    entriesUpdated: integer("entries_updated").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Operator-facing failure summary. Never a raw source record or a connection string. */
    failureReason: text("failure_reason"),
    ...timestamps(),
  },
  (t) => [
    unique("lexical_imports_source_checksum_scope_key").on(t.sourceId, t.fileChecksum, t.scopeKey),
    index("lexical_imports_source_started_idx").on(t.sourceId, t.startedAt.desc()),
  ],
);

/**
 * Polyglot's stable lexical identity (spec 12 "Dictionary Entries"). The
 * primary key is Polyglot's own UUID, never the upstream identifier —
 * `source_entry_key` is merely how this row is *recognized* across
 * reimports, and a reimport must preserve `id` so every mapping and sense
 * selection survives.
 */
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageId: uuid("language_id")
      .notNull()
      .references(() => languages.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => lexicalSources.id, { onDelete: "restrict" }),
    /** The headword exactly as the source spells it, diacritics intact. */
    lemma: text("lemma").notNull(),
    /** `normalizeLexicalForm(lemma)` — case/whitespace/Unicode only. Accents are never stripped ("si" ≠ "sí"). */
    normalizedLemma: text("normalized_lemma").notNull(),
    /** Polyglot's normalized part of speech (see `domains/lexicon`'s POS mapping), not the raw upstream tag. */
    partOfSpeech: text("part_of_speech").notNull(),
    /**
     * Stable per-source recognition key, e.g. "padre#noun#0" — how a reimport
     * recognizes an entry it has seen before. Unique within
     * `(source_id, language_id)`, not within the source alone: one dictionary
     * source legitimately serves every Polyglot language sharing its base
     * language (Wiktionary's Spanish extract backs `es-MX` today and would
     * back an `es-ES` added later), and keying on the source alone would let
     * one language's import silently reassign the other's entry.
     */
    sourceEntryKey: text("source_entry_key").notNull(),
    sourceStatus: dictionarySourceStatusEnum("source_status").notNull().default("active"),
    /**
     * Regions the source's own usage labels restrict this entry to (e.g.
     * `["es-ES"]` for a sense marked "Spain"). Empty for almost every entry.
     * Projected at import time so the matcher can read it in the same query
     * as the candidate itself; deliberately not indexed, since nothing
     * queries *by* it — spec 12's "no broad JSONB indexes unless a real
     * query needs them".
     */
    restrictedRegionCodes: jsonb("restricted_region_codes").$type<string[]>().notNull().default([]),
    firstSeenImportId: uuid("first_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    lastSeenImportId: uuid("last_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("dictionary_entries_source_language_entry_key").on(t.sourceId, t.languageId, t.sourceEntryKey),
    index("dictionary_entries_lemma_idx").on(t.languageId, t.normalizedLemma),
    index("dictionary_entries_lemma_pos_idx").on(t.languageId, t.normalizedLemma, t.partOfSpeech),
  ],
);

/**
 * The complete upstream object for one entry at one import (spec 12 "Raw
 * Dictionary Data"). This is the hybrid model's JSONB half: retained for
 * source history, reprocessing, admin inspection, and import debugging, and
 * deliberately never read on a learner page — every learner-visible field is
 * projected into the relational tables below.
 *
 * `(dictionary_entry_id, source_hash)` is unique so importing the same
 * unchanged record twice keeps one version row rather than accumulating
 * identical copies.
 */
export const dictionaryEntryVersions = pgTable(
  "dictionary_entry_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionaryEntryId: uuid("dictionary_entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    lexicalImportId: uuid("lexical_import_id")
      .notNull()
      .references(() => lexicalImports.id, { onDelete: "restrict" }),
    sourceRecordKey: text("source_record_key").notNull(),
    /** SHA-256 over the canonical serialization of `raw_data`. */
    sourceHash: text("source_hash").notNull(),
    rawData: jsonb("raw_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("dictionary_entry_versions_entry_hash_key").on(t.dictionaryEntryId, t.sourceHash),
    index("dictionary_entry_versions_entry_idx").on(t.dictionaryEntryId, t.createdAt.desc()),
    index("dictionary_entry_versions_import_idx").on(t.lexicalImportId),
  ],
);

/**
 * One imported meaning (spec 12 "Senses"). `source_sense_key` recognizes the
 * same sense across reimports so a selection survives; `source_fingerprint`
 * detects that its *content* changed even when the key did not.
 *
 * A sense is never deleted on reimport — it is marked
 * `missing_from_source`, because a vocabulary item may have selected it and
 * spec 12 requires that selection be retained and escalated to admin review
 * rather than silently replaced.
 */
export const dictionarySenses = pgTable(
  "dictionary_senses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionaryEntryId: uuid("dictionary_entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    sourceSenseKey: text("source_sense_key").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    senseOrder: integer("sense_order").notNull(),
    gloss: text("gloss").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    topics: jsonb("topics").$type<string[]>().notNull().default([]),
    sourceStatus: dictionarySourceStatusEnum("source_status").notNull().default("active"),
    firstSeenImportId: uuid("first_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    lastSeenImportId: uuid("last_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("dictionary_senses_entry_source_key").on(t.dictionaryEntryId, t.sourceSenseKey),
    index("dictionary_senses_entry_idx").on(t.dictionaryEntryId),
  ],
);

/**
 * Inflected/alternative written forms (spec 12 "Forms"). Indexed on
 * `normalized_form` because form matching is the second pass of the matching
 * algorithm: a curriculum item whose display word is a plural or a
 * conjugation still has to reach its lemma's entry.
 */
export const dictionaryForms = pgTable(
  "dictionary_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionaryEntryId: uuid("dictionary_entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    form: text("form").notNull(),
    normalizedForm: text("normalized_form").notNull(),
    /** Upstream tags describing the form, e.g. ["plural"], ["feminine"], ["participle"]. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    sourceFingerprint: text("source_fingerprint").notNull(),
    sourceStatus: dictionarySourceStatusEnum("source_status").notNull().default("active"),
    firstSeenImportId: uuid("first_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    lastSeenImportId: uuid("last_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("dictionary_forms_entry_fingerprint_key").on(t.dictionaryEntryId, t.sourceFingerprint),
    index("dictionary_forms_normalized_idx").on(t.normalizedForm),
    index("dictionary_forms_entry_idx").on(t.dictionaryEntryId),
  ],
);

/**
 * IPA and related pronunciation evidence (spec 12 "Pronunciations").
 * `region_code` is nullable — most Wiktionary pronunciations carry no
 * regional label at all, and inventing one would be fabricated evidence.
 */
export const dictionaryPronunciations = pgTable(
  "dictionary_pronunciations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionaryEntryId: uuid("dictionary_entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    ipa: text("ipa"),
    /** e.g. "es-MX". Null when the source attaches no region. */
    regionCode: text("region_code"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Source-provided audio reference. Metadata only — Polyglot does not fetch or host it in this spec. */
    audioUrl: text("audio_url"),
    sourceFingerprint: text("source_fingerprint").notNull(),
    sourceStatus: dictionarySourceStatusEnum("source_status").notNull().default("active"),
    firstSeenImportId: uuid("first_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    lastSeenImportId: uuid("last_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("dictionary_pronunciations_entry_fingerprint_key").on(t.dictionaryEntryId, t.sourceFingerprint),
    index("dictionary_pronunciations_entry_idx").on(t.dictionaryEntryId),
  ],
);

/**
 * Lexical relationships (spec 12 "Relationships"). Stores the *target
 * lemma as written*, plus an optional resolved `target_dictionary_entry_id`
 * when that lemma also happens to be imported — a synonym pointing at a word
 * outside the imported scope is still real evidence and must not be dropped.
 *
 * These never create curriculum items: spec 12 is explicit that dictionary
 * forms and synonyms are not a source of new vocabulary.
 */
export const dictionaryRelations = pgTable(
  "dictionary_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionaryEntryId: uuid("dictionary_entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    relationType: dictionaryRelationTypeEnum("relation_type").notNull(),
    targetLemma: text("target_lemma").notNull(),
    normalizedTargetLemma: text("normalized_target_lemma").notNull(),
    targetDictionaryEntryId: uuid("target_dictionary_entry_id").references(() => dictionaryEntries.id, {
      onDelete: "set null",
    }),
    sourceStatus: dictionarySourceStatusEnum("source_status").notNull().default("active"),
    firstSeenImportId: uuid("first_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    lastSeenImportId: uuid("last_seen_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("dictionary_relations_entry_type_target_key").on(t.dictionaryEntryId, t.relationType, t.normalizedTargetLemma),
    index("dictionary_relations_entry_idx").on(t.dictionaryEntryId),
  ],
);

/**
 * The one point of contact between curriculum and lexicon (spec 12
 * "Vocabulary Mapping"). One vocabulary item maps to at most one dictionary
 * entry in this first implementation, enforced by the unique constraint on
 * `vocabulary_item_id` rather than left to convention.
 *
 * A row exists even when nothing matched: `match_status` carries
 * `unmatched`/`source_data_not_imported` so the Admin review queue can
 * distinguish "searched and found nothing" from "never looked", and so an
 * item's mapping state is a fact on disk rather than something recomputed
 * differently by each caller.
 *
 * `manual_lock` is the protection spec 12 requires: once an admin picks an
 * entry, no automatic pass may remap the item, ever. Only another explicit
 * admin action can.
 */
export const vocabularyDictionaryMappings = pgTable(
  "vocabulary_dictionary_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vocabularyItemId: uuid("vocabulary_item_id")
      .notNull()
      .unique()
      .references(() => vocabularyItems.learningItemId, { onDelete: "cascade" }),
    dictionaryEntryId: uuid("dictionary_entry_id").references(() => dictionaryEntries.id, { onDelete: "restrict" }),
    /** The lookup form this mapping was resolved through, e.g. "padre" for the display word "el padre". */
    lookupForm: text("lookup_form").notNull(),
    matchStatus: dictionaryMatchStatusEnum("match_status").notNull(),
    confidence: dictionaryMatchConfidenceEnum("confidence"),
    manualLock: boolean("manual_lock").notNull().default(false),
    preferredPronunciationId: uuid("preferred_pronunciation_id").references(() => dictionaryPronunciations.id, {
      onDelete: "set null",
    }),
    /** Why this needs review, e.g. "multiple_candidates", "selected_sense_missing". Never free-form learner content. */
    reviewReason: text("review_reason"),
    mappedByUserId: uuid("mapped_by_user_id").references(() => users.id, { onDelete: "set null" }),
    mappedAt: timestamp("mapped_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("vocabulary_dictionary_mappings_item_idx").on(t.vocabularyItemId),
    index("vocabulary_dictionary_mappings_entry_idx").on(t.dictionaryEntryId),
    index("vocabulary_dictionary_mappings_status_idx").on(t.matchStatus),
  ],
);

/**
 * Which of an entry's senses this vocabulary item actually teaches (spec 12
 * "Senses"). Polyglot may display the whole dictionary entry while only
 * these senses are accepted as taught meaning — selection is always an
 * explicit admin act, never inferred, because spec 12 forbids automatically
 * choosing the pedagogically correct sense.
 */
export const vocabularySelectedSenses = pgTable(
  "vocabulary_selected_senses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vocabularyItemId: uuid("vocabulary_item_id")
      .notNull()
      .references(() => vocabularyItems.learningItemId, { onDelete: "cascade" }),
    dictionarySenseId: uuid("dictionary_sense_id")
      .notNull()
      .references(() => dictionarySenses.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    selectedByUserId: uuid("selected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    unique("vocabulary_selected_senses_item_sense_key").on(t.vocabularyItemId, t.dictionarySenseId),
    index("vocabulary_selected_senses_item_idx").on(t.vocabularyItemId),
  ],
);

/**
 * A regional word list projected into relational rows (spec 12 "RLA
 * Import"). Hunspell's `.dic`/`.aff` specifics stay behind the RLA adapter —
 * this table stores only what generic code needs: which region recognizes
 * which word, plus the raw affix flags for later reprocessing.
 *
 * One row per (source, region, normalized word); a reimport updates
 * `lexical_import_id` in place rather than accumulating a copy per snapshot,
 * because this is a *current projection*, and `lexical_imports` already
 * holds the snapshot history.
 */
export const regionalLexemes = pgTable(
  "regional_lexemes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => lexicalSources.id, { onDelete: "restrict" }),
    lexicalImportId: uuid("lexical_import_id")
      .notNull()
      .references(() => lexicalImports.id, { onDelete: "restrict" }),
    /** BCP-47-ish region code, e.g. "es-MX", "es". Never a `castilian` boolean — the model must extend to es-AR, es-CO, … */
    regionCode: text("region_code").notNull(),
    word: text("word").notNull(),
    normalizedWord: text("normalized_word").notNull(),
    /** Raw Hunspell affix flags as written after the `/`, retained verbatim for reprocessing. */
    affixFlags: text("affix_flags"),
    sourceData: jsonb("source_data").$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  (t) => [
    unique("regional_lexemes_source_region_word_key").on(t.sourceId, t.regionCode, t.normalizedWord),
    index("regional_lexemes_region_word_idx").on(t.regionCode, t.normalizedWord),
  ],
);

/**
 * Cached regional evidence for one dictionary entry in one region (spec 12
 * "RLA-ES"). Derived from `regional_lexemes`, stored so the read model and
 * the Admin review queue can filter and display regional status without
 * re-deriving it per row.
 *
 * `not_listed` is evidence of absence, never a claim of invalidity —
 * see `regional_evidence_status`'s own note.
 */
export const dictionaryRegionalEvidence = pgTable(
  "dictionary_regional_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dictionaryEntryId: uuid("dictionary_entry_id")
      .notNull()
      .references(() => dictionaryEntries.id, { onDelete: "cascade" }),
    regionCode: text("region_code").notNull(),
    status: regionalEvidenceStatusEnum("status").notNull(),
    /** The regional source this evidence came from. Null when status is `unknown` because no source covers the region. */
    sourceId: uuid("source_id").references(() => lexicalSources.id, { onDelete: "set null" }),
    lexicalImportId: uuid("lexical_import_id").references(() => lexicalImports.id, { onDelete: "set null" }),
    /** Which form actually matched, when one did — so an admin can see *why* the entry is marked recognized. */
    matchedForm: text("matched_form"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    unique("dictionary_regional_evidence_entry_region_key").on(t.dictionaryEntryId, t.regionCode),
    index("dictionary_regional_evidence_entry_region_idx").on(t.dictionaryEntryId, t.regionCode),
  ],
);
