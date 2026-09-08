import { db } from "@/db/client";
import { getRateLimiter } from "@/providers/rate-limit";
import { LexiconError } from "@/lib/errors/lexicon-errors";

import * as mapping from "./lexicon-mapping-service";
import * as repository from "./lexicon-repository";
import { getVocabularyDetail as composeVocabularyDetail } from "./lexicon-read-model";
import type { VocabularyDetail } from "./lexicon-read-model";
import { normalizeLexicalForm } from "./lexical-normalization";
import {
  bulkConfirmVocabularyMappingsInputSchema,
  confirmMappingInputSchema,
  mappingQueueInputSchema,
  matchImportedVocabularyItemsInputSchema,
  rematchVocabularyItemInputSchema,
  searchDictionaryInputSchema,
  selectPronunciationInputSchema,
  selectSensesInputSchema,
  setManualMappingInputSchema,
} from "./lexicon-schemas";
import type {
  BulkConfirmVocabularyMappingsInput,
  ConfirmMappingInput,
  MappingQueueInput,
  MatchImportedVocabularyItemsInput,
  RematchVocabularyItemInput,
  SearchDictionaryInput,
  SelectPronunciationInput,
  SelectSensesInput,
  SetManualMappingInput,
} from "./lexicon-schemas";
import { getRegionalEvidence as evaluateRegionalEvidence } from "./regional-evidence";
import type {
  ConfirmedLessonDictionaryData,
  DictionaryEntryDetail,
  DictionaryEntrySummary,
  DictionaryMatchStatus,
  RegionalEvidenceStatus,
  VocabularyDictionaryMapping,
} from "./lexicon-types";

/**
 * Binds the real app database and rate limiter to the Lexicon domain's
 * injectable functions — the same split `domains/admin/admin-mutation-service.ts`
 * and `domains/srs/review-service.ts` already use, and for the same reason:
 * the injectable layer stays testable against a rolled-back transaction,
 * while the `server-only`-guarded `db`/rate-limiter imports live here.
 *
 * Every mutation below validates its input against a Zod schema before the
 * domain sees it, and is rate limited per actor. Authentication and the
 * `canManageCurriculum` authorization check happen in the calling Server
 * Action — `hiding UI is never authorization`, so the action rechecks the
 * role server-side on every call.
 */

async function checkAdminRateLimit(actorUserId: string): Promise<void> {
  const decision = await getRateLimiter().check({ policy: "admin-mutation", subject: actorUserId });
  if (!decision.allowed) {
    throw new LexiconError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
}

export async function rematchVocabularyItem(input: RematchVocabularyItemInput): Promise<mapping.MatchVocabularyItemResult> {
  const parsed = rematchVocabularyItemInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.matchVocabularyItem(db, parsed.vocabularyItemId);
}

/** Spec 13: runs immediately after a bulk vocabulary import commits. */
export async function matchImportedVocabularyItems(input: MatchImportedVocabularyItemsInput): Promise<mapping.MatchAllResult> {
  const parsed = matchImportedVocabularyItemsInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.matchImportedVocabularyItems(db, parsed.vocabularyItemIds);
}

export async function setVocabularyDictionaryEntry(input: SetManualMappingInput): Promise<VocabularyDictionaryMapping> {
  const parsed = setManualMappingInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.selectDictionaryEntry(db, parsed);
}

export async function confirmVocabularyMapping(input: ConfirmMappingInput): Promise<VocabularyDictionaryMapping> {
  const parsed = confirmMappingInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.confirmVocabularyMapping(db, parsed);
}

export async function bulkConfirmVocabularyMappings(input: BulkConfirmVocabularyMappingsInput): Promise<{ confirmed: string[] }> {
  const parsed = bulkConfirmVocabularyMappingsInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.bulkConfirmVocabularyMappings(db, parsed);
}

export async function selectVocabularySenses(input: SelectSensesInput): Promise<string[]> {
  const parsed = selectSensesInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.selectVocabularySenses(db, parsed);
}

export async function selectPreferredPronunciation(input: SelectPronunciationInput): Promise<VocabularyDictionaryMapping> {
  const parsed = selectPronunciationInputSchema.parse(input);
  await checkAdminRateLimit(parsed.actorUserId);
  return mapping.selectPreferredPronunciation(db, parsed);
}

export async function getVocabularyDetail(
  input: { vocabularyItemId: string; userId?: string | null; includeArchived?: boolean },
): Promise<VocabularyDetail | null> {
  return composeVocabularyDetail(db, input);
}

export async function getVocabularyMapping(vocabularyItemId: string): Promise<VocabularyDictionaryMapping | null> {
  return repository.getMapping(db, vocabularyItemId);
}

/**
 * Batch entry point for {@link repository.getConfirmedDictionaryDataForItems}
 * — the lesson flow's one call for "everything the dictionary has" across a
 * whole lesson batch, never one call per item.
 */
export async function getConfirmedDictionaryDataForItems(vocabularyItemIds: string[]): Promise<Map<string, ConfirmedLessonDictionaryData>> {
  return repository.getConfirmedDictionaryDataForItems(db, vocabularyItemIds);
}

export async function getSelectedSenseIds(vocabularyItemId: string): Promise<string[]> {
  return repository.getSelectedSenseIds(db, vocabularyItemId);
}

export async function getDictionaryEntryDetail(entryId: string): Promise<DictionaryEntryDetail | null> {
  return repository.getDictionaryEntryDetail(db, entryId);
}

/** Admin dictionary search. The query is normalized the same way stored lemmas are, so accents behave identically on both sides. */
export async function searchDictionary(input: SearchDictionaryInput): Promise<DictionaryEntrySummary[]> {
  const parsed = searchDictionaryInputSchema.parse(input);
  return repository.searchDictionaryEntries(db, {
    languageId: parsed.languageId,
    normalizedQuery: normalizeLexicalForm(parsed.query),
    limit: parsed.limit,
  });
}

export async function getMappingQueue(input: MappingQueueInput): Promise<repository.MappingQueuePage> {
  const parsed = mappingQueueInputSchema.parse(input);
  return repository.getMappingQueue(db, parsed);
}

export async function getMappingStatusCounts(languageId: string): Promise<Record<DictionaryMatchStatus | "no_mapping", number>> {
  return repository.getMappingStatusCounts(db, languageId);
}

/** Admin-only raw source inspection (spec 12 "Admin UI Integration"). Never reachable from a learner-facing read path. */
export async function getEntryRawVersions(entryId: string, limit = 3) {
  return repository.getEntryRawVersions(db, entryId, limit);
}

export async function getRegionalEvidence(
  term: string,
  regionCode: string,
): Promise<{ status: RegionalEvidenceStatus; matchedForm: string | null }> {
  return evaluateRegionalEvidence(db, term, regionCode);
}

export interface VocabularyMappingView {
  mapping: VocabularyDictionaryMapping | null;
  entry: DictionaryEntryDetail | null;
  selectedSenseIds: string[];
  attributionText: string | null;
}

/**
 * Everything the Admin mapping panel needs, in one call. Composed here
 * rather than in the page, so the editor route stays free of cross-table
 * fetch orchestration (code-standards.md: pages don't contain ad hoc data
 * logic when a service owns the operation).
 *
 * Distinct from `getVocabularyDetail`, the learner-facing read model: this
 * one returns *every* sense so an admin can pick among them, where the read
 * model leads with the selected ones.
 */
export async function getVocabularyMappingView(vocabularyItemId: string): Promise<VocabularyMappingView> {
  const mapping = await repository.getMapping(db, vocabularyItemId);
  if (!mapping?.dictionaryEntryId) {
    return { mapping, entry: null, selectedSenseIds: [], attributionText: null };
  }

  const [entry, selectedSenseIds] = await Promise.all([
    repository.getDictionaryEntryDetail(db, mapping.dictionaryEntryId),
    repository.getSelectedSenseIds(db, vocabularyItemId),
  ]);
  const attribution = entry ? await repository.getSourceAttribution(db, entry.sourceId) : null;

  return { mapping, entry, selectedSenseIds, attributionText: attribution?.attributionText ?? null };
}
