import type { DbClient } from "@/db/client";
import { recordAuditEvent } from "@/domains/admin/audit-repository";
import { withIdempotency } from "@/domains/idempotency";
import { LexiconError } from "@/lib/errors/lexicon-errors";

import { composeVocabularyDisplayWord, getLexicalLanguageProvider } from "./lexical-language-provider";
import { normalizePartOfSpeech } from "./lexical-normalization";
import { getDictionarySourceCodeForLanguage } from "./lexical-source-registry";
import { resolveDictionaryMatch } from "./lexicon-matching";
import {
  confirmMapping,
  findMatchCandidates,
  getDictionaryEntrySummary,
  getLexicalSourceByCode,
  getMapping,
  getMatchableVocabularyItem,
  getMatchableVocabularyItems,
  getPronunciationEntryId,
  getSelectedSenseIds,
  getSenseEntryIds,
  hasImportedEntries,
  pruneSelectedSensesOutsideEntry,
  replaceSelectedSenses,
  setManualMapping,
  setPreferredPronunciation,
  upsertAutomaticMapping,
} from "./lexicon-repository";
import type { VocabularyDictionaryMapping } from "./lexicon-types";

/**
 * Spec 12's mapping workflow: run the deterministic matcher, and let an
 * admin override it. Takes an injected `DbClient` so it runs against the app
 * database in production and a rolled-back transaction in integration tests;
 * authentication, authorization, and rate limiting live one layer up in
 * `lexicon-service.ts`, exactly as `domains/admin/publication-service.ts`
 * splits them.
 *
 * Every admin mutation here is wrapped in `withIdempotency` and records an
 * audit event inside the same transaction as the change it describes — the
 * pattern `domains/admin` established, reused rather than re-invented.
 *
 * What this module will not do, in any code path:
 *
 * - write a curriculum, progress, or SRS row;
 * - choose which sense a vocabulary item teaches;
 * - replace a mapping an admin locked.
 */

/** Resolves the dictionary source for a language, or fails loudly rather than silently matching against nothing. */
async function resolveDictionarySourceId(db: DbClient, languageCode: string): Promise<string> {
  const sourceCode = getDictionarySourceCodeForLanguage(languageCode);
  if (!sourceCode) {
    throw new LexiconError("LEXICAL_SOURCE_NOT_CONFIGURED", `No dictionary source is registered for language "${languageCode}".`);
  }
  const source = await getLexicalSourceByCode(db, sourceCode);
  if (!source) {
    throw new LexiconError(
      "LEXICAL_SOURCE_NOT_CONFIGURED",
      `Dictionary source "${sourceCode}" has never been imported. Run \`npm run lexicon:import\` first.`,
    );
  }
  return source.id;
}

export interface MatchVocabularyItemResult {
  mapping: VocabularyDictionaryMapping | null;
  /** True when the item's mapping was left untouched because an admin had locked it. */
  skippedBecauseLocked: boolean;
}

/**
 * Runs the matcher for one vocabulary item and persists the conclusion.
 *
 * Called on demand from the Admin UI and in bulk after an import. It is
 * deliberately *not* wrapped in idempotency or an audit event: it is a pure
 * recomputation from data already on disk, produces the same result every
 * time for the same inputs, and records nothing an admin decided. Only
 * admin decisions are audited.
 */
export async function matchVocabularyItem(
  db: DbClient,
  vocabularyItemId: string,
): Promise<MatchVocabularyItemResult> {
  const item = await getMatchableVocabularyItem(db, vocabularyItemId);
  if (!item) throw new LexiconError("VOCABULARY_ITEM_NOT_FOUND");

  const existing = await getMapping(db, vocabularyItemId);
  if (existing?.manualLock) return { mapping: existing, skippedBecauseLocked: true };

  const provider = getLexicalLanguageProvider(item.languageCode);
  const sourceId = await resolveDictionarySourceId(db, item.languageCode);
  const primaryRegionCode = provider.regionCodes[0] ?? null;

  const lookupForms = provider.deriveDictionaryLookups(composeVocabularyDisplayWord(item.term, item.article));
  const [candidates, isSourceDataImported] = await Promise.all([
    findMatchCandidates(db, { languageId: item.languageId, sourceId, lookupForms, primaryRegionCode }),
    hasImportedEntries(db, item.languageId, sourceId),
  ]);

  const resolution = resolveDictionaryMatch({
    lookupForms,
    candidates,
    curriculumPartOfSpeech: normalizePartOfSpeech(item.partOfSpeech),
    isSourceDataImported,
    primaryRegionCode,
  });

  const mapping = await upsertAutomaticMapping(db, {
    vocabularyItemId,
    dictionaryEntryId: resolution.dictionaryEntryId,
    lookupForm: resolution.lookupForm,
    matchStatus: resolution.status,
    confidence: resolution.confidence,
    reviewReason: resolution.reviewReason,
  });

  return { mapping, skippedBecauseLocked: mapping === null };
}

export interface MatchAllResult {
  processed: number;
  skippedLocked: number;
  byStatus: Record<string, number>;
}

/**
 * Re-matches every vocabulary item in a language. Run after an import, when
 * new entries may resolve items that previously had nothing to match.
 * Manually-locked mappings are counted and skipped, never revisited.
 */
export async function matchAllVocabularyItems(db: DbClient, languageId: string): Promise<MatchAllResult> {
  const items = await getMatchableVocabularyItems(db, languageId);
  const byStatus: Record<string, number> = {};
  let skippedLocked = 0;

  for (const item of items) {
    const result = await matchVocabularyItem(db, item.vocabularyItemId);
    if (result.skippedBecauseLocked) {
      skippedLocked += 1;
      continue;
    }
    const status = result.mapping?.matchStatus ?? "unmatched";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { processed: items.length, skippedLocked, byStatus };
}

/**
 * Matches exactly the given vocabulary items — spec 13's bulk import,
 * immediately after `domains/admin/bulk-import-service.ts`'s
 * `bulkImportVocabulary` commits. Deliberately scoped to the batch rather
 * than reusing `matchAllVocabularyItems` (which re-matches the *entire*
 * language): a curriculum with thousands of already-matched items shouldn't
 * pay to re-process all of them every time fifty new rows are imported.
 */
export async function matchImportedVocabularyItems(db: DbClient, vocabularyItemIds: string[]): Promise<MatchAllResult> {
  const byStatus: Record<string, number> = {};
  let skippedLocked = 0;

  for (const vocabularyItemId of vocabularyItemIds) {
    const result = await matchVocabularyItem(db, vocabularyItemId);
    if (result.skippedBecauseLocked) {
      skippedLocked += 1;
      continue;
    }
    const status = result.mapping?.matchStatus ?? "unmatched";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  return { processed: vocabularyItemIds.length, skippedLocked, byStatus };
}

export interface MappingMutationInput {
  vocabularyItemId: string;
  actorUserId: string;
  idempotencyKey: string;
}

export type SelectDictionaryEntryInput = MappingMutationInput & { dictionaryEntryId: string };

/**
 * An admin explicitly choosing a dictionary entry (spec 12 "Manual Mapping
 * Protection"). Sets `manual_lock`, so no future import can move it.
 *
 * Selections belonging to a *different* entry are pruned, because they
 * describe meanings the newly chosen entry does not have. Learner progress
 * is untouched — spec 12's "that action must not reset learner progress" —
 * and nothing in this transaction writes a curriculum or progress table.
 */
export async function selectDictionaryEntry(
  db: DbClient,
  input: SelectDictionaryEntryInput,
): Promise<VocabularyDictionaryMapping> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.lexicon.select-entry",
      key: input.idempotencyKey,
      payload: { vocabularyItemId: input.vocabularyItemId, dictionaryEntryId: input.dictionaryEntryId },
    },
    async (tx) => {
      const item = await getMatchableVocabularyItem(tx, input.vocabularyItemId);
      if (!item) throw new LexiconError("VOCABULARY_ITEM_NOT_FOUND");

      const entry = await getDictionaryEntrySummary(tx, input.dictionaryEntryId);
      if (!entry) throw new LexiconError("DICTIONARY_ENTRY_NOT_FOUND");
      // A cross-language mapping would be nonsense and is not merely
      // discouraged — reject it server-side rather than trusting the UI to
      // only ever offer same-language candidates.
      if (entry.languageId !== item.languageId) throw new LexiconError("DICTIONARY_ENTRY_NOT_FOUND");

      const before = await getMapping(tx, input.vocabularyItemId);
      const provider = getLexicalLanguageProvider(item.languageCode);
      const lookups = provider.deriveDictionaryLookups(composeVocabularyDisplayWord(item.term, item.article));
      // Record the derived form that actually reaches the chosen entry, not
      // simply the first one. For "la coma" mapped to the entry "coma", the
      // honest lookup form is "coma" — the queue's Lookup column is meant to
      // show what was searched for, and the full display word would be
      // misleading.
      const lookupForm = lookups.find((form) => form === entry.normalizedLemma) ?? lookups[0] ?? item.term;

      const mapping = await setManualMapping(tx, {
        vocabularyItemId: input.vocabularyItemId,
        dictionaryEntryId: input.dictionaryEntryId,
        lookupForm,
        actorUserId: input.actorUserId,
        mappedAt: new Date(),
      });

      const prunedSenses = await pruneSelectedSensesOutsideEntry(tx, {
        vocabularyItemId: input.vocabularyItemId,
        keepEntryId: input.dictionaryEntryId,
      });

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "DICTIONARY_MAPPING_CHANGED",
        resourceType: "vocabulary_dictionary_mapping",
        resourceId: input.vocabularyItemId,
        beforeData: before
          ? { dictionaryEntryId: before.dictionaryEntryId, matchStatus: before.matchStatus, manualLock: before.manualLock }
          : null,
        afterData: { dictionaryEntryId: mapping.dictionaryEntryId, matchStatus: mapping.matchStatus, manualLock: true, prunedSenses },
      });

      return mapping;
    },
  );
}

export type BulkConfirmVocabularyMappingsInput = {
  vocabularyItemIds: string[];
  actorUserId: string;
  idempotencyKey: string;
};

/**
 * Spec 13's "batch confirmation of reviewed mappings" — the queue stays
 * read-only in the sense `mapping-queue-table.tsx`'s docstring means
 * (nothing there decides *which* candidate is right; that judgment still
 * only happens in the per-item mapping panel). This batches the exact same
 * terminal step `confirmVocabularyMapping` performs — one call instead of
 * clicking Confirm once per already-reviewed item — mirroring
 * `domains/admin/publication-service.ts`'s `bulkArchiveItems` shape: one
 * outer transaction, one audit event per item sharing a `correlationId`,
 * rather than nesting each item's own idempotency-wrapped call.
 */
export async function bulkConfirmVocabularyMappings(
  db: DbClient,
  input: BulkConfirmVocabularyMappingsInput,
): Promise<{ confirmed: string[] }> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.lexicon.bulk-confirm-mappings",
      key: input.idempotencyKey,
      payload: { vocabularyItemIds: input.vocabularyItemIds },
    },
    async (tx) => {
      const confirmed: string[] = [];
      for (const vocabularyItemId of input.vocabularyItemIds) {
        const before = await getMapping(tx, vocabularyItemId);
        if (!before) throw new LexiconError("MAPPING_NOT_FOUND");
        if (!before.dictionaryEntryId) throw new LexiconError("MAPPING_NOT_FOUND", "There is no matched entry to confirm.");

        const mapping = await confirmMapping(tx, { vocabularyItemId, actorUserId: input.actorUserId, mappedAt: new Date() });
        if (!mapping) throw new LexiconError("MAPPING_NOT_FOUND");

        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "DICTIONARY_MAPPING_CONFIRMED",
          resourceType: "vocabulary_dictionary_mapping",
          resourceId: vocabularyItemId,
          beforeData: { matchStatus: before.matchStatus, reviewReason: before.reviewReason },
          afterData: { dictionaryEntryId: mapping.dictionaryEntryId, matchStatus: mapping.matchStatus },
          correlationId: input.idempotencyKey,
        });
        confirmed.push(vocabularyItemId);
      }
      return { confirmed };
    },
  );
}

/** An admin agreeing with an automatic match. Locks it, so a reimport cannot quietly move it afterwards. */
export async function confirmVocabularyMapping(
  db: DbClient,
  input: MappingMutationInput,
): Promise<VocabularyDictionaryMapping> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.lexicon.confirm-mapping",
      key: input.idempotencyKey,
      payload: { vocabularyItemId: input.vocabularyItemId },
    },
    async (tx) => {
      const before = await getMapping(tx, input.vocabularyItemId);
      if (!before) throw new LexiconError("MAPPING_NOT_FOUND");
      if (!before.dictionaryEntryId) throw new LexiconError("MAPPING_NOT_FOUND", "There is no matched entry to confirm.");

      const mapping = await confirmMapping(tx, {
        vocabularyItemId: input.vocabularyItemId,
        actorUserId: input.actorUserId,
        mappedAt: new Date(),
      });
      if (!mapping) throw new LexiconError("MAPPING_NOT_FOUND");

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "DICTIONARY_MAPPING_CONFIRMED",
        resourceType: "vocabulary_dictionary_mapping",
        resourceId: input.vocabularyItemId,
        beforeData: { matchStatus: before.matchStatus, reviewReason: before.reviewReason },
        afterData: { dictionaryEntryId: mapping.dictionaryEntryId, matchStatus: mapping.matchStatus },
      });

      return mapping;
    },
  );
}

export type SelectSensesServiceInput = MappingMutationInput & { senseIds: string[] };

/**
 * Which senses this item teaches (spec 12 "Senses"). Always an explicit
 * admin act — nothing automatic ever writes this table, because spec 12
 * forbids automatically choosing the pedagogically correct sense.
 *
 * Every submitted sense is verified server-side to belong to the item's
 * currently mapped entry. A client-supplied id is a request, not proof.
 */
export async function selectVocabularySenses(db: DbClient, input: SelectSensesServiceInput): Promise<string[]> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.lexicon.select-senses",
      key: input.idempotencyKey,
      payload: { vocabularyItemId: input.vocabularyItemId, senseIds: [...input.senseIds].sort() },
    },
    async (tx) => {
      const mapping = await getMapping(tx, input.vocabularyItemId);
      if (!mapping?.dictionaryEntryId) throw new LexiconError("MAPPING_NOT_FOUND");

      const senseEntryIds = await getSenseEntryIds(tx, input.senseIds);
      for (const senseId of input.senseIds) {
        if (senseEntryIds.get(senseId) !== mapping.dictionaryEntryId) {
          throw new LexiconError("SENSE_NOT_IN_MAPPED_ENTRY");
        }
      }

      const before = await getSelectedSenseIds(tx, input.vocabularyItemId);
      await replaceSelectedSenses(tx, {
        vocabularyItemId: input.vocabularyItemId,
        senseIds: input.senseIds,
        actorUserId: input.actorUserId,
        selectedAt: new Date(),
      });

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "DICTIONARY_SENSE_SELECTED",
        resourceType: "vocabulary_dictionary_mapping",
        resourceId: input.vocabularyItemId,
        beforeData: { senseIds: before },
        afterData: { senseIds: input.senseIds },
      });

      return input.senseIds;
    },
  );
}

export type SelectPronunciationServiceInput = MappingMutationInput & { pronunciationId: string | null };

/** The preferred pronunciation for an item, verified to belong to its mapped entry. `null` clears the preference. */
export async function selectPreferredPronunciation(
  db: DbClient,
  input: SelectPronunciationServiceInput,
): Promise<VocabularyDictionaryMapping> {
  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.lexicon.select-pronunciation",
      key: input.idempotencyKey,
      payload: { vocabularyItemId: input.vocabularyItemId, pronunciationId: input.pronunciationId },
    },
    async (tx) => {
      const mapping = await getMapping(tx, input.vocabularyItemId);
      if (!mapping?.dictionaryEntryId) throw new LexiconError("MAPPING_NOT_FOUND");

      if (input.pronunciationId !== null) {
        const entryId = await getPronunciationEntryId(tx, input.pronunciationId);
        if (entryId !== mapping.dictionaryEntryId) throw new LexiconError("PRONUNCIATION_NOT_IN_MAPPED_ENTRY");
      }

      const updated = await setPreferredPronunciation(tx, {
        vocabularyItemId: input.vocabularyItemId,
        pronunciationId: input.pronunciationId,
      });
      if (!updated) throw new LexiconError("MAPPING_NOT_FOUND");

      await recordAuditEvent(tx, {
        actorUserId: input.actorUserId,
        action: "DICTIONARY_PRONUNCIATION_SELECTED",
        resourceType: "vocabulary_dictionary_mapping",
        resourceId: input.vocabularyItemId,
        beforeData: { preferredPronunciationId: mapping.preferredPronunciationId },
        afterData: { preferredPronunciationId: updated.preferredPronunciationId },
      });

      return updated;
    },
  );
}
