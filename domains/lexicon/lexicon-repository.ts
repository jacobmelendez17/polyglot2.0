import { and, asc, count, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  dictionaryEntries,
  dictionaryEntryVersions,
  dictionaryForms,
  dictionaryPronunciations,
  dictionaryRegionalEvidence,
  dictionaryRelations,
  dictionarySenses,
  learningItems,
  languages,
  levels,
  lexicalImports,
  lexicalSources,
  regionalLexemes,
  vocabularyDictionaryMappings,
  vocabularyGroups,
  vocabularyItems,
  vocabularySelectedSenses,
} from "@/db/schema";

import type { DictionaryMatchCandidate } from "./lexicon-matching";
import type {
  DictionaryEntryDetail,
  DictionaryEntrySummary,
  DictionaryMatchConfidence,
  DictionaryMatchStatus,
  LexicalAttribution,
  LexicalSource,
  MappingReviewReason,
  RegionalEvidence,
  RegionalEvidenceStatus,
  VocabularyDictionaryMapping,
} from "./lexicon-types";

/**
 * Lexicon persistence (spec 12). Injected `DbClient`, never the `db`
 * singleton — same rule as every other repository here.
 *
 * This module reads `vocabulary_items`/`learning_items`/`levels`/
 * `vocabulary_groups` in the mapping-queue and read-model queries, because a
 * mapping row is meaningless without the curriculum item it points at and
 * splitting one indexed join into two round trips per row would be a
 * needless N+1. It **only ever reads** them: every write in this file
 * targets a `lexicon` table, which is what makes spec 12's "external
 * dictionary imports must never modify curriculum Level / group / SRS /
 * learner progress / official translation / publication state" structurally
 * true rather than merely intended.
 */

type MappingRow = typeof vocabularyDictionaryMappings.$inferSelect;

function toMapping(row: MappingRow): VocabularyDictionaryMapping {
  return {
    id: row.id,
    vocabularyItemId: row.vocabularyItemId,
    dictionaryEntryId: row.dictionaryEntryId,
    lookupForm: row.lookupForm,
    matchStatus: row.matchStatus,
    confidence: row.confidence,
    manualLock: row.manualLock,
    preferredPronunciationId: row.preferredPronunciationId,
    reviewReason: (row.reviewReason as MappingReviewReason | null) ?? null,
    mappedByUserId: row.mappedByUserId,
    mappedAt: row.mappedAt,
  };
}

export async function getLexicalSourceByCode(db: DbClient, code: string): Promise<LexicalSource | null> {
  const [row] = await db.select().from(lexicalSources).where(eq(lexicalSources.code, code)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    provider: row.provider,
    sourceType: row.sourceType,
    sourceLanguage: row.sourceLanguage,
    entryLanguage: row.entryLanguage,
    licenseMetadata: row.licenseMetadata,
    attributionText: row.attributionText,
  };
}

/** Attribution for a source's most recent completed import — travels with any surfaced dictionary content. */
export async function getSourceAttribution(db: DbClient, sourceId: string): Promise<LexicalAttribution | null> {
  const [row] = await db
    .select({
      code: lexicalSources.code,
      provider: lexicalSources.provider,
      attributionText: lexicalSources.attributionText,
      sourceVersion: lexicalImports.sourceVersion,
    })
    .from(lexicalSources)
    .leftJoin(
      lexicalImports,
      and(eq(lexicalImports.sourceId, lexicalSources.id), eq(lexicalImports.status, "completed")),
    )
    .where(eq(lexicalSources.id, sourceId))
    .orderBy(desc(lexicalImports.completedAt))
    .limit(1);
  if (!row) return null;
  return {
    sourceCode: row.code,
    provider: row.provider,
    attributionText: row.attributionText,
    sourceVersion: row.sourceVersion,
  };
}

/**
 * Whether any dictionary data exists for this language and source at all.
 * Drives the `source_data_not_imported` mapping state, which spec 12
 * requires be distinguishable from a genuine `unmatched`.
 */
export async function hasImportedEntries(db: DbClient, languageId: string, sourceId: string): Promise<boolean> {
  const [row] = await db
    .select({ total: count() })
    .from(dictionaryEntries)
    .where(and(eq(dictionaryEntries.languageId, languageId), eq(dictionaryEntries.sourceId, sourceId)))
    .limit(1);
  return (row?.total ?? 0) > 0;
}

export interface FindMatchCandidatesInput {
  languageId: string;
  sourceId: string;
  /** Normalized lookup forms from the language provider. */
  lookupForms: string[];
  /** The region whose evidence should accompany each candidate, if any. */
  primaryRegionCode?: string | null;
}

/**
 * Every entry any lookup form can reach, by headword or by inflected form,
 * in two indexed queries rather than one per form. The matcher does all
 * ranking; this function only gathers evidence, so the decision rules stay
 * pure and unit-testable.
 */
export async function findMatchCandidates(
  db: DbClient,
  input: FindMatchCandidatesInput,
): Promise<DictionaryMatchCandidate[]> {
  const { languageId, sourceId, lookupForms, primaryRegionCode } = input;
  if (lookupForms.length === 0) return [];

  const scope = and(eq(dictionaryEntries.languageId, languageId), eq(dictionaryEntries.sourceId, sourceId));
  const evidenceJoin = primaryRegionCode
    ? and(
        eq(dictionaryRegionalEvidence.dictionaryEntryId, dictionaryEntries.id),
        eq(dictionaryRegionalEvidence.regionCode, primaryRegionCode),
      )
    : sql`false`;

  const lemmaRows = await db
    .select({
      entryId: dictionaryEntries.id,
      partOfSpeech: dictionaryEntries.partOfSpeech,
      sourceStatus: dictionaryEntries.sourceStatus,
      restrictedRegionCodes: dictionaryEntries.restrictedRegionCodes,
      matchedLookupForm: dictionaryEntries.normalizedLemma,
      evidence: dictionaryRegionalEvidence.status,
    })
    .from(dictionaryEntries)
    .leftJoin(dictionaryRegionalEvidence, evidenceJoin)
    .where(and(scope, inArray(dictionaryEntries.normalizedLemma, lookupForms)));

  const formRows = await db
    .select({
      entryId: dictionaryEntries.id,
      partOfSpeech: dictionaryEntries.partOfSpeech,
      sourceStatus: dictionaryEntries.sourceStatus,
      restrictedRegionCodes: dictionaryEntries.restrictedRegionCodes,
      matchedLookupForm: dictionaryForms.normalizedForm,
      evidence: dictionaryRegionalEvidence.status,
    })
    .from(dictionaryForms)
    .innerJoin(dictionaryEntries, eq(dictionaryEntries.id, dictionaryForms.dictionaryEntryId))
    .leftJoin(dictionaryRegionalEvidence, evidenceJoin)
    .where(
      and(
        scope,
        eq(dictionaryForms.sourceStatus, "active"),
        inArray(dictionaryForms.normalizedForm, lookupForms),
      ),
    );

  const candidates: DictionaryMatchCandidate[] = [];
  const seen = new Set<string>();

  const push = (row: (typeof lemmaRows)[number], matchedVia: "lemma" | "form") => {
    // A form row whose entry was already reached by its headword adds no new
    // evidence — the stronger lemma match already represents that entry.
    const key = `${row.entryId}:${row.matchedLookupForm}:${matchedVia}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      entryId: row.entryId,
      partOfSpeech: row.partOfSpeech,
      sourceStatus: row.sourceStatus,
      matchedLookupForm: row.matchedLookupForm,
      matchedVia,
      restrictedRegionCodes: row.restrictedRegionCodes,
      primaryRegionEvidence: row.evidence ?? undefined,
    });
  };

  for (const row of lemmaRows) push(row, "lemma");
  const lemmaEntryIds = new Set(lemmaRows.map((row) => row.entryId));
  for (const row of formRows) {
    if (lemmaEntryIds.has(row.entryId)) continue;
    push(row, "form");
  }

  return candidates;
}

export async function getDictionaryEntrySummary(db: DbClient, entryId: string): Promise<DictionaryEntrySummary | null> {
  const [row] = await db.select().from(dictionaryEntries).where(eq(dictionaryEntries.id, entryId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    languageId: row.languageId,
    sourceId: row.sourceId,
    lemma: row.lemma,
    normalizedLemma: row.normalizedLemma,
    partOfSpeech: row.partOfSpeech,
    sourceEntryKey: row.sourceEntryKey,
    sourceStatus: row.sourceStatus,
  };
}

/**
 * One entry with its full relational projection. Deliberately excludes
 * `dictionary_entry_versions.raw_data` — spec 12 requires that normal page
 * loads never parse large source JSON, and that raw dictionary JSON is never
 * exposed to ordinary learners. Raw inspection is its own admin-only call
 * (`getEntryRawVersions`).
 */
export async function getDictionaryEntryDetail(db: DbClient, entryId: string): Promise<DictionaryEntryDetail | null> {
  const summary = await getDictionaryEntrySummary(db, entryId);
  if (!summary) return null;

  const [senseRows, formRows, pronunciationRows, relationRows, evidenceRows] = await Promise.all([
    db
      .select()
      .from(dictionarySenses)
      .where(eq(dictionarySenses.dictionaryEntryId, entryId))
      .orderBy(asc(dictionarySenses.senseOrder), asc(dictionarySenses.id)),
    db.select().from(dictionaryForms).where(eq(dictionaryForms.dictionaryEntryId, entryId)).orderBy(asc(dictionaryForms.form)),
    db
      .select()
      .from(dictionaryPronunciations)
      .where(eq(dictionaryPronunciations.dictionaryEntryId, entryId))
      .orderBy(asc(dictionaryPronunciations.id)),
    db
      .select()
      .from(dictionaryRelations)
      .where(eq(dictionaryRelations.dictionaryEntryId, entryId))
      .orderBy(asc(dictionaryRelations.relationType), asc(dictionaryRelations.targetLemma)),
    db
      .select()
      .from(dictionaryRegionalEvidence)
      .where(eq(dictionaryRegionalEvidence.dictionaryEntryId, entryId))
      .orderBy(asc(dictionaryRegionalEvidence.regionCode)),
  ]);

  return {
    ...summary,
    senses: senseRows.map((row) => ({
      id: row.id,
      senseOrder: row.senseOrder,
      gloss: row.gloss,
      tags: row.tags,
      topics: row.topics,
      sourceStatus: row.sourceStatus,
    })),
    forms: formRows.map((row) => ({ id: row.id, form: row.form, tags: row.tags, sourceStatus: row.sourceStatus })),
    pronunciations: pronunciationRows.map((row) => ({
      id: row.id,
      ipa: row.ipa,
      regionCode: row.regionCode,
      tags: row.tags,
      audioUrl: row.audioUrl,
      sourceStatus: row.sourceStatus,
    })),
    relations: relationRows.map((row) => ({
      id: row.id,
      relationType: row.relationType,
      targetLemma: row.targetLemma,
      targetDictionaryEntryId: row.targetDictionaryEntryId,
      sourceStatus: row.sourceStatus,
    })),
    regionalEvidence: evidenceRows.map((row) => ({
      regionCode: row.regionCode,
      status: row.status,
      matchedForm: row.matchedForm,
      evaluatedAt: row.evaluatedAt,
    })),
  };
}

/** Admin-only raw source inspection (spec 12 "Admin UI Integration"). Bounded — never the entry's whole history at once. */
export async function getEntryRawVersions(
  db: DbClient,
  entryId: string,
  limit: number,
): Promise<{ id: string; sourceHash: string; createdAt: Date; rawData: unknown }[]> {
  return db
    .select({
      id: dictionaryEntryVersions.id,
      sourceHash: dictionaryEntryVersions.sourceHash,
      createdAt: dictionaryEntryVersions.createdAt,
      rawData: dictionaryEntryVersions.rawData,
    })
    .from(dictionaryEntryVersions)
    .where(eq(dictionaryEntryVersions.dictionaryEntryId, entryId))
    .orderBy(desc(dictionaryEntryVersions.createdAt))
    .limit(limit);
}

/**
 * Admin dictionary search. Prefix-matched on the normalized lemma so it uses
 * `dictionary_entries(language_id, normalized_lemma)` rather than degrading
 * into a sequential scan, and always bounded by `limit`.
 *
 * The pattern is passed as a bound parameter, never interpolated (spec 12
 * "Security": do not interpolate imported content into SQL — the same rule
 * applies to admin-supplied search text).
 */
export async function searchDictionaryEntries(
  db: DbClient,
  input: { languageId: string; normalizedQuery: string; limit: number },
): Promise<DictionaryEntrySummary[]> {
  const rows = await db
    .select()
    .from(dictionaryEntries)
    .where(
      and(
        eq(dictionaryEntries.languageId, input.languageId),
        sql`${dictionaryEntries.normalizedLemma} LIKE ${`${input.normalizedQuery}%`}`,
      ),
    )
    .orderBy(asc(dictionaryEntries.normalizedLemma), asc(dictionaryEntries.partOfSpeech))
    .limit(input.limit);

  return rows.map((row) => ({
    id: row.id,
    languageId: row.languageId,
    sourceId: row.sourceId,
    lemma: row.lemma,
    normalizedLemma: row.normalizedLemma,
    partOfSpeech: row.partOfSpeech,
    sourceEntryKey: row.sourceEntryKey,
    sourceStatus: row.sourceStatus,
  }));
}

export async function getMapping(db: DbClient, vocabularyItemId: string): Promise<VocabularyDictionaryMapping | null> {
  const [row] = await db
    .select()
    .from(vocabularyDictionaryMappings)
    .where(eq(vocabularyDictionaryMappings.vocabularyItemId, vocabularyItemId))
    .limit(1);
  return row ? toMapping(row) : null;
}

export interface UpsertMappingInput {
  vocabularyItemId: string;
  dictionaryEntryId: string | null;
  lookupForm: string;
  matchStatus: DictionaryMatchStatus;
  confidence: DictionaryMatchConfidence | null;
  reviewReason: MappingReviewReason | null;
  manualLock?: boolean;
  mappedByUserId?: string | null;
  mappedAt?: Date | null;
}

/**
 * Writes the automatic matcher's conclusion. **Never touches a
 * manually-locked row** — spec 12's manual-mapping protection is enforced
 * here, in the one statement that could otherwise replace an admin's
 * decision, rather than trusted to every caller remembering to check first.
 *
 * Returns `null` when the write was skipped because the mapping is locked,
 * so callers can report "left alone" honestly instead of implying a change.
 */
export async function upsertAutomaticMapping(
  db: DbClient,
  input: UpsertMappingInput,
): Promise<VocabularyDictionaryMapping | null> {
  const [row] = await db
    .insert(vocabularyDictionaryMappings)
    .values({
      vocabularyItemId: input.vocabularyItemId,
      dictionaryEntryId: input.dictionaryEntryId,
      lookupForm: input.lookupForm,
      matchStatus: input.matchStatus,
      confidence: input.confidence,
      reviewReason: input.reviewReason,
      manualLock: input.manualLock ?? false,
      mappedByUserId: input.mappedByUserId ?? null,
      mappedAt: input.mappedAt ?? null,
    })
    .onConflictDoUpdate({
      target: vocabularyDictionaryMappings.vocabularyItemId,
      set: {
        dictionaryEntryId: input.dictionaryEntryId,
        lookupForm: input.lookupForm,
        matchStatus: input.matchStatus,
        confidence: input.confidence,
        reviewReason: input.reviewReason,
        updatedAt: new Date(),
      },
      where: eq(vocabularyDictionaryMappings.manualLock, false),
    })
    .returning();
  return row ? toMapping(row) : null;
}

/**
 * An admin explicitly choosing an entry (spec 12 "Manual Mapping
 * Protection"). Always sets `manual_lock`, so no later import can replace
 * it; only another explicit admin action can.
 */
export async function setManualMapping(
  db: DbClient,
  input: { vocabularyItemId: string; dictionaryEntryId: string; lookupForm: string; actorUserId: string; mappedAt: Date },
): Promise<VocabularyDictionaryMapping> {
  const [row] = await db
    .insert(vocabularyDictionaryMappings)
    .values({
      vocabularyItemId: input.vocabularyItemId,
      dictionaryEntryId: input.dictionaryEntryId,
      lookupForm: input.lookupForm,
      matchStatus: "manual",
      confidence: "high",
      reviewReason: null,
      manualLock: true,
      mappedByUserId: input.actorUserId,
      mappedAt: input.mappedAt,
    })
    .onConflictDoUpdate({
      target: vocabularyDictionaryMappings.vocabularyItemId,
      set: {
        dictionaryEntryId: input.dictionaryEntryId,
        lookupForm: input.lookupForm,
        matchStatus: "manual",
        confidence: "high",
        reviewReason: null,
        manualLock: true,
        mappedByUserId: input.actorUserId,
        mappedAt: input.mappedAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toMapping(row);
}

/** An admin confirming an automatic match. Same lock, so a reimport can never quietly move it. */
export async function confirmMapping(
  db: DbClient,
  input: { vocabularyItemId: string; actorUserId: string; mappedAt: Date },
): Promise<VocabularyDictionaryMapping | null> {
  const [row] = await db
    .update(vocabularyDictionaryMappings)
    .set({
      matchStatus: "manual",
      reviewReason: null,
      manualLock: true,
      mappedByUserId: input.actorUserId,
      mappedAt: input.mappedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vocabularyDictionaryMappings.vocabularyItemId, input.vocabularyItemId),
        isNotNull(vocabularyDictionaryMappings.dictionaryEntryId),
      ),
    )
    .returning();
  return row ? toMapping(row) : null;
}

export async function setPreferredPronunciation(
  db: DbClient,
  input: { vocabularyItemId: string; pronunciationId: string | null },
): Promise<VocabularyDictionaryMapping | null> {
  const [row] = await db
    .update(vocabularyDictionaryMappings)
    .set({ preferredPronunciationId: input.pronunciationId, updatedAt: new Date() })
    .where(eq(vocabularyDictionaryMappings.vocabularyItemId, input.vocabularyItemId))
    .returning();
  return row ? toMapping(row) : null;
}

export async function getSelectedSenseIds(db: DbClient, vocabularyItemId: string): Promise<string[]> {
  const rows = await db
    .select({ dictionarySenseId: vocabularySelectedSenses.dictionarySenseId })
    .from(vocabularySelectedSenses)
    .where(eq(vocabularySelectedSenses.vocabularyItemId, vocabularyItemId))
    .orderBy(asc(vocabularySelectedSenses.position));
  return rows.map((row) => row.dictionarySenseId);
}

/**
 * Replaces an item's selected senses wholesale. The caller runs this inside
 * a transaction; the delete-then-insert pair is what makes "these exactly"
 * expressible without a diff, and the unique constraint on
 * `(vocabulary_item_id, dictionary_sense_id)` backstops it.
 */
export async function replaceSelectedSenses(
  db: DbClient,
  input: { vocabularyItemId: string; senseIds: string[]; actorUserId: string; selectedAt: Date },
): Promise<void> {
  await db.delete(vocabularySelectedSenses).where(eq(vocabularySelectedSenses.vocabularyItemId, input.vocabularyItemId));
  if (input.senseIds.length === 0) return;
  await db.insert(vocabularySelectedSenses).values(
    input.senseIds.map((senseId, index) => ({
      vocabularyItemId: input.vocabularyItemId,
      dictionarySenseId: senseId,
      position: index,
      selectedByUserId: input.actorUserId,
      selectedAt: input.selectedAt,
    })),
  );
}

/** Drops selections that don't belong to `keepEntryId` — used when an admin remaps an item to a different entry. */
export async function pruneSelectedSensesOutsideEntry(
  db: DbClient,
  input: { vocabularyItemId: string; keepEntryId: string },
): Promise<number> {
  const senseIdsForEntry = db
    .select({ id: dictionarySenses.id })
    .from(dictionarySenses)
    .where(eq(dictionarySenses.dictionaryEntryId, input.keepEntryId));

  const removed = await db
    .delete(vocabularySelectedSenses)
    .where(
      and(
        eq(vocabularySelectedSenses.vocabularyItemId, input.vocabularyItemId),
        sql`${vocabularySelectedSenses.dictionarySenseId} NOT IN ${senseIdsForEntry}`,
      ),
    )
    .returning({ id: vocabularySelectedSenses.id });
  return removed.length;
}

/**
 * Escalates mappings whose evidence stopped holding after a reimport (spec
 * 12 "Removed Entries and Senses", "Manual Mapping Protection").
 *
 * `manual_lock` is deliberately left alone: a locked mapping still gets
 * flagged for review — spec 12 explicitly asks for admin review when an
 * entry disappears — but the lock stays set, so nothing automatic can
 * repoint it while it waits for that decision.
 */
export async function flagMappingsNeedingReview(db: DbClient): Promise<{ flagged: number }> {
  const itemsWithMissingSense = db
    .selectDistinct({ vocabularyItemId: vocabularySelectedSenses.vocabularyItemId })
    .from(vocabularySelectedSenses)
    .innerJoin(dictionarySenses, eq(dictionarySenses.id, vocabularySelectedSenses.dictionarySenseId))
    .where(eq(dictionarySenses.sourceStatus, "missing_from_source"));

  const missingSenseFlagged = await db
    .update(vocabularyDictionaryMappings)
    .set({ matchStatus: "review_required", reviewReason: "selected_sense_missing", confidence: null, updatedAt: new Date() })
    .where(
      and(
        sql`${vocabularyDictionaryMappings.vocabularyItemId} IN ${itemsWithMissingSense}`,
        sql`${vocabularyDictionaryMappings.reviewReason} IS DISTINCT FROM 'selected_sense_missing'`,
      ),
    )
    .returning({ id: vocabularyDictionaryMappings.id });

  const missingEntryIds = db
    .select({ id: dictionaryEntries.id })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.sourceStatus, "missing_from_source"));

  const missingEntryFlagged = await db
    .update(vocabularyDictionaryMappings)
    .set({ matchStatus: "review_required", reviewReason: "entry_missing_from_source", confidence: null, updatedAt: new Date() })
    .where(
      and(
        sql`${vocabularyDictionaryMappings.dictionaryEntryId} IN ${missingEntryIds}`,
        sql`${vocabularyDictionaryMappings.reviewReason} IS DISTINCT FROM 'entry_missing_from_source'`,
      ),
    )
    .returning({ id: vocabularyDictionaryMappings.id });

  return { flagged: missingSenseFlagged.length + missingEntryFlagged.length };
}

/** Regional evidence lookup (spec 12's `getRegionalEvidence(term, region)`), by normalized word. */
export async function findRegionalLexeme(
  db: DbClient,
  input: { regionCode: string; normalizedWord: string },
): Promise<{ word: string } | null> {
  const [row] = await db
    .select({ word: regionalLexemes.word })
    .from(regionalLexemes)
    .where(and(eq(regionalLexemes.regionCode, input.regionCode), eq(regionalLexemes.normalizedWord, input.normalizedWord)))
    .limit(1);
  return row ?? null;
}

/** Whether any regional word list has been imported for a region — distinguishes `not_listed` from `unknown`. */
export async function hasRegionalData(db: DbClient, regionCode: string): Promise<boolean> {
  const [row] = await db
    .select({ total: count() })
    .from(regionalLexemes)
    .where(eq(regionalLexemes.regionCode, regionCode))
    .limit(1);
  return (row?.total ?? 0) > 0;
}

export interface UpsertRegionalEvidenceInput {
  dictionaryEntryId: string;
  regionCode: string;
  status: RegionalEvidenceStatus;
  sourceId: string | null;
  lexicalImportId: string | null;
  matchedForm: string | null;
  evaluatedAt: Date;
}

export async function upsertRegionalEvidence(db: DbClient, rows: UpsertRegionalEvidenceInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const written = await db
    .insert(dictionaryRegionalEvidence)
    .values(rows)
    .onConflictDoUpdate({
      target: [dictionaryRegionalEvidence.dictionaryEntryId, dictionaryRegionalEvidence.regionCode],
      set: {
        status: sql`excluded.status`,
        sourceId: sql`excluded.source_id`,
        lexicalImportId: sql`excluded.lexical_import_id`,
        matchedForm: sql`excluded.matched_form`,
        evaluatedAt: sql`excluded.evaluated_at`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: dictionaryRegionalEvidence.id });
  return written.length;
}

export async function getRegionalEvidenceForEntry(db: DbClient, entryId: string): Promise<RegionalEvidence[]> {
  const rows = await db
    .select()
    .from(dictionaryRegionalEvidence)
    .where(eq(dictionaryRegionalEvidence.dictionaryEntryId, entryId))
    .orderBy(asc(dictionaryRegionalEvidence.regionCode));
  return rows.map((row) => ({
    regionCode: row.regionCode,
    status: row.status,
    matchedForm: row.matchedForm,
    evaluatedAt: row.evaluatedAt,
  }));
}

/**
 * Every published/pending vocabulary item in a language, with the fields the
 * matcher needs. Read-only, and used both by the curriculum-scope import
 * planner (which lookup forms to retain) and by the bulk re-match pass.
 */
export interface MatchableVocabularyItem {
  vocabularyItemId: string;
  term: string;
  article: string | null;
  partOfSpeech: string;
}

export async function getMatchableVocabularyItems(db: DbClient, languageId: string): Promise<MatchableVocabularyItem[]> {
  return db
    .select({
      vocabularyItemId: vocabularyItems.learningItemId,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      partOfSpeech: vocabularyItems.partOfSpeech,
    })
    .from(vocabularyItems)
    .innerJoin(learningItems, eq(learningItems.id, vocabularyItems.learningItemId))
    .where(eq(learningItems.languageId, languageId))
    .orderBy(asc(vocabularyItems.term));
}

export interface MappingQueueFilters {
  languageId: string;
  levelId?: string;
  vocabularyGroupId?: string;
  matchStatus?: DictionaryMatchStatus;
  partOfSpeech?: string;
  regionCode?: string;
  regionalStatus?: RegionalEvidenceStatus;
}

export interface MappingQueueRow {
  vocabularyItemId: string;
  displayWord: string;
  translation: string;
  levelNumber: number;
  groupName: string;
  curriculumPartOfSpeech: string;
  lookupForm: string | null;
  matchStatus: DictionaryMatchStatus | null;
  confidence: DictionaryMatchConfidence | null;
  reviewReason: MappingReviewReason | null;
  manualLock: boolean;
  entryId: string | null;
  entryLemma: string | null;
  entryPartOfSpeech: string | null;
  regionalStatus: RegionalEvidenceStatus | null;
}

export interface MappingQueuePage {
  rows: MappingQueueRow[];
  total: number;
}

/**
 * The Admin mapping review table (spec 12 "Admin Mapping Review"). A left
 * join from curriculum, not an inner join from mappings: an item that has
 * never been matched must still appear in the queue, which is the whole
 * point of having an `unmatched`/`source_data_not_imported` state.
 *
 * Offset-paginated rather than keyset — this is a filtered admin table with a
 * page-number control and a total count, the same shape as the existing
 * `/admin/curriculum` listing, and the row count is bounded by the size of
 * the curriculum rather than by learner activity.
 */
export async function getMappingQueue(
  db: DbClient,
  input: MappingQueueFilters & { limit: number; offset: number },
): Promise<MappingQueuePage> {
  const evidenceJoin = input.regionCode
    ? and(
        eq(dictionaryRegionalEvidence.dictionaryEntryId, dictionaryEntries.id),
        eq(dictionaryRegionalEvidence.regionCode, input.regionCode),
      )
    : sql`false`;

  const conditions = [eq(learningItems.languageId, input.languageId), eq(learningItems.type, "vocabulary")];
  if (input.levelId) conditions.push(eq(learningItems.levelId, input.levelId));
  if (input.vocabularyGroupId) conditions.push(eq(vocabularyItems.vocabularyGroupId, input.vocabularyGroupId));
  if (input.partOfSpeech) conditions.push(eq(vocabularyItems.partOfSpeech, input.partOfSpeech));
  if (input.matchStatus) {
    // An item with no mapping row at all reads as `source_data_not_imported`
    // — nothing has looked at it yet — so that filter must also match NULL.
    conditions.push(
      input.matchStatus === "source_data_not_imported"
        ? or(eq(vocabularyDictionaryMappings.matchStatus, input.matchStatus), sql`${vocabularyDictionaryMappings.id} IS NULL`)!
        : eq(vocabularyDictionaryMappings.matchStatus, input.matchStatus),
    );
  }
  if (input.regionalStatus) conditions.push(eq(dictionaryRegionalEvidence.status, input.regionalStatus));

  const where = and(...conditions);

  const baseQuery = db
    .select({
      vocabularyItemId: vocabularyItems.learningItemId,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      translation: vocabularyItems.primaryMeaning,
      curriculumPartOfSpeech: vocabularyItems.partOfSpeech,
      levelNumber: levels.levelNumber,
      groupName: vocabularyGroups.name,
      lookupForm: vocabularyDictionaryMappings.lookupForm,
      matchStatus: vocabularyDictionaryMappings.matchStatus,
      confidence: vocabularyDictionaryMappings.confidence,
      reviewReason: vocabularyDictionaryMappings.reviewReason,
      manualLock: vocabularyDictionaryMappings.manualLock,
      entryId: dictionaryEntries.id,
      entryLemma: dictionaryEntries.lemma,
      entryPartOfSpeech: dictionaryEntries.partOfSpeech,
      regionalStatus: dictionaryRegionalEvidence.status,
    })
    .from(vocabularyItems)
    .innerJoin(learningItems, eq(learningItems.id, vocabularyItems.learningItemId))
    .innerJoin(levels, eq(levels.id, learningItems.levelId))
    .innerJoin(vocabularyGroups, eq(vocabularyGroups.id, vocabularyItems.vocabularyGroupId))
    .leftJoin(vocabularyDictionaryMappings, eq(vocabularyDictionaryMappings.vocabularyItemId, vocabularyItems.learningItemId))
    .leftJoin(dictionaryEntries, eq(dictionaryEntries.id, vocabularyDictionaryMappings.dictionaryEntryId))
    .leftJoin(dictionaryRegionalEvidence, evidenceJoin)
    .where(where);

  const [rows, [totalRow]] = await Promise.all([
    baseQuery.orderBy(asc(levels.levelNumber), asc(vocabularyGroups.position), asc(vocabularyItems.term)).limit(input.limit).offset(input.offset),
    db
      .select({ total: count() })
      .from(vocabularyItems)
      .innerJoin(learningItems, eq(learningItems.id, vocabularyItems.learningItemId))
      .innerJoin(levels, eq(levels.id, learningItems.levelId))
      .innerJoin(vocabularyGroups, eq(vocabularyGroups.id, vocabularyItems.vocabularyGroupId))
      .leftJoin(vocabularyDictionaryMappings, eq(vocabularyDictionaryMappings.vocabularyItemId, vocabularyItems.learningItemId))
      .leftJoin(dictionaryEntries, eq(dictionaryEntries.id, vocabularyDictionaryMappings.dictionaryEntryId))
      .leftJoin(dictionaryRegionalEvidence, evidenceJoin)
      .where(where),
  ]);

  return {
    rows: rows.map((row) => ({
      vocabularyItemId: row.vocabularyItemId,
      displayWord: row.article ? `${row.article} ${row.term}` : row.term,
      translation: row.translation,
      levelNumber: row.levelNumber,
      groupName: row.groupName,
      curriculumPartOfSpeech: row.curriculumPartOfSpeech,
      lookupForm: row.lookupForm,
      matchStatus: row.matchStatus,
      confidence: row.confidence,
      reviewReason: (row.reviewReason as MappingReviewReason | null) ?? null,
      manualLock: row.manualLock ?? false,
      entryId: row.entryId,
      entryLemma: row.entryLemma,
      entryPartOfSpeech: row.entryPartOfSpeech,
      regionalStatus: row.regionalStatus,
    })),
    total: totalRow?.total ?? 0,
  };
}

/** Mapping-state counts for the Admin dashboard header. One grouped query, never one per state. */
export async function getMappingStatusCounts(
  db: DbClient,
  languageId: string,
): Promise<Record<DictionaryMatchStatus | "no_mapping", number>> {
  const rows = await db
    .select({ matchStatus: vocabularyDictionaryMappings.matchStatus, total: count() })
    .from(vocabularyItems)
    .innerJoin(learningItems, eq(learningItems.id, vocabularyItems.learningItemId))
    .leftJoin(vocabularyDictionaryMappings, eq(vocabularyDictionaryMappings.vocabularyItemId, vocabularyItems.learningItemId))
    .where(and(eq(learningItems.languageId, languageId), eq(learningItems.type, "vocabulary")))
    .groupBy(vocabularyDictionaryMappings.matchStatus);

  const counts: Record<DictionaryMatchStatus | "no_mapping", number> = {
    unmatched: 0,
    source_data_not_imported: 0,
    auto_matched: 0,
    review_required: 0,
    manual: 0,
    no_mapping: 0,
  };
  for (const row of rows) {
    if (row.matchStatus === null) counts.no_mapping = row.total;
    else counts[row.matchStatus] = row.total;
  }
  return counts;
}

export interface EntryLexicalForms {
  entryId: string;
  normalizedLemma: string;
  normalizedForms: string[];
}

/**
 * Entries with every normalized form they can be recognized by, keyset-paged
 * by id so a full-language evidence refresh streams in bounded batches
 * rather than materializing the whole dictionary.
 */
export async function getEntryLexicalForms(
  db: DbClient,
  input: { languageId: string; sourceId: string; afterId: string | null; limit: number },
): Promise<EntryLexicalForms[]> {
  const conditions = [eq(dictionaryEntries.languageId, input.languageId), eq(dictionaryEntries.sourceId, input.sourceId)];
  if (input.afterId) conditions.push(sql`${dictionaryEntries.id} > ${input.afterId}`);

  const entries = await db
    .select({ id: dictionaryEntries.id, normalizedLemma: dictionaryEntries.normalizedLemma })
    .from(dictionaryEntries)
    .where(and(...conditions))
    .orderBy(asc(dictionaryEntries.id))
    .limit(input.limit);

  if (entries.length === 0) return [];

  const entryIds = entries.map((entry) => entry.id);
  const formRows = await db
    .select({ dictionaryEntryId: dictionaryForms.dictionaryEntryId, normalizedForm: dictionaryForms.normalizedForm })
    .from(dictionaryForms)
    .where(and(inArray(dictionaryForms.dictionaryEntryId, entryIds), eq(dictionaryForms.sourceStatus, "active")));

  const formsByEntry = new Map<string, string[]>();
  for (const row of formRows) {
    const list = formsByEntry.get(row.dictionaryEntryId);
    if (list) list.push(row.normalizedForm);
    else formsByEntry.set(row.dictionaryEntryId, [row.normalizedForm]);
  }

  return entries.map((entry) => ({
    entryId: entry.id,
    normalizedLemma: entry.normalizedLemma,
    normalizedForms: formsByEntry.get(entry.id) ?? [],
  }));
}

/** Which of `normalizedWords` a region's word list recognizes, and under which spelling. One query per batch, never one per word. */
export async function findRegionalLexemes(
  db: DbClient,
  input: { regionCode: string; normalizedWords: string[] },
): Promise<Map<string, { word: string; sourceId: string; lexicalImportId: string }>> {
  if (input.normalizedWords.length === 0) return new Map();
  const rows = await db
    .select({
      normalizedWord: regionalLexemes.normalizedWord,
      word: regionalLexemes.word,
      sourceId: regionalLexemes.sourceId,
      lexicalImportId: regionalLexemes.lexicalImportId,
    })
    .from(regionalLexemes)
    .where(and(eq(regionalLexemes.regionCode, input.regionCode), inArray(regionalLexemes.normalizedWord, input.normalizedWords)));

  const byWord = new Map<string, { word: string; sourceId: string; lexicalImportId: string }>();
  for (const row of rows) {
    if (!byWord.has(row.normalizedWord)) {
      byWord.set(row.normalizedWord, { word: row.word, sourceId: row.sourceId, lexicalImportId: row.lexicalImportId });
    }
  }
  return byWord;
}

export interface MatchableVocabularyItemDetail extends MatchableVocabularyItem {
  languageId: string;
  languageCode: string;
  primaryMeaning: string;
}

/** One vocabulary item with everything the matcher needs, including the language code that selects the language provider. */
export async function getMatchableVocabularyItem(
  db: DbClient,
  vocabularyItemId: string,
): Promise<MatchableVocabularyItemDetail | null> {
  const [row] = await db
    .select({
      vocabularyItemId: vocabularyItems.learningItemId,
      term: vocabularyItems.term,
      article: vocabularyItems.article,
      partOfSpeech: vocabularyItems.partOfSpeech,
      primaryMeaning: vocabularyItems.primaryMeaning,
      languageId: learningItems.languageId,
      languageCode: languages.code,
    })
    .from(vocabularyItems)
    .innerJoin(learningItems, eq(learningItems.id, vocabularyItems.learningItemId))
    .innerJoin(languages, eq(languages.id, learningItems.languageId))
    .where(eq(vocabularyItems.learningItemId, vocabularyItemId))
    .limit(1);
  return row ?? null;
}

/** Whether a sense belongs to a given entry — the server-side check behind sense selection, never trusted from the client. */
export async function getSenseEntryIds(db: DbClient, senseIds: string[]): Promise<Map<string, string>> {
  if (senseIds.length === 0) return new Map();
  const rows = await db
    .select({ id: dictionarySenses.id, dictionaryEntryId: dictionarySenses.dictionaryEntryId })
    .from(dictionarySenses)
    .where(inArray(dictionarySenses.id, senseIds));
  return new Map(rows.map((row) => [row.id, row.dictionaryEntryId]));
}

/** Same check for a pronunciation. */
export async function getPronunciationEntryId(db: DbClient, pronunciationId: string): Promise<string | null> {
  const [row] = await db
    .select({ dictionaryEntryId: dictionaryPronunciations.dictionaryEntryId })
    .from(dictionaryPronunciations)
    .where(eq(dictionaryPronunciations.id, pronunciationId))
    .limit(1);
  return row?.dictionaryEntryId ?? null;
}
