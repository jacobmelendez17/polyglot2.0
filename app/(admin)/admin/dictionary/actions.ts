"use server";

import { z } from "zod";

import { canManageCurriculum } from "@/domains/admin";
import type { DictionaryEntrySummary, VocabularyDictionaryMapping } from "@/domains/lexicon";
import {
  bulkConfirmVocabularyMappings,
  confirmVocabularyMapping,
  rematchVocabularyItem,
  searchDictionary,
  selectPreferredPronunciation,
  selectVocabularySenses,
  setVocabularyDictionaryEntry,
} from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";
import { LexiconError } from "@/lib/errors/lexicon-errors";

/**
 * Server Action entry points for the Admin dictionary workflow (spec 12
 * "Admin UI Integration"/"Admin Mapping Review"). Mirrors
 * `app/(admin)/admin/curriculum/actions.ts` exactly: thin, Zod-validated,
 * re-authenticating and re-checking `canManageCurriculum` on every call.
 *
 * Spec 12 requires admin mapping mutations to carry authoritative Admin
 * authorization — hiding a control is never authorization, so the check
 * happens here, server-side, regardless of what the UI rendered.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function runDictionaryAction<T>(fn: (actorUserId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canManageCurriculum(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof LexiconError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected dictionary action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const itemActionSchema = z.object({ vocabularyItemId: z.string().min(1), idempotencyKey: z.string().min(1) });

export async function rematchVocabularyItemAction(
  input: z.infer<typeof itemActionSchema>,
): Promise<ActionResult<{ matchStatus: string | null; skippedBecauseLocked: boolean }>> {
  return runDictionaryAction(async (actorUserId) => {
    const parsed = itemActionSchema.parse(input);
    const result = await rematchVocabularyItem({ ...parsed, actorUserId });
    return { matchStatus: result.mapping?.matchStatus ?? null, skippedBecauseLocked: result.skippedBecauseLocked };
  });
}

const setEntrySchema = itemActionSchema.extend({ dictionaryEntryId: z.string().min(1) });

export async function setDictionaryEntryAction(
  input: z.infer<typeof setEntrySchema>,
): Promise<ActionResult<VocabularyDictionaryMapping>> {
  return runDictionaryAction(async (actorUserId) => {
    const parsed = setEntrySchema.parse(input);
    return setVocabularyDictionaryEntry({ ...parsed, actorUserId });
  });
}

export async function confirmMappingAction(
  input: z.infer<typeof itemActionSchema>,
): Promise<ActionResult<VocabularyDictionaryMapping>> {
  return runDictionaryAction(async (actorUserId) => {
    const parsed = itemActionSchema.parse(input);
    return confirmVocabularyMapping({ ...parsed, actorUserId });
  });
}

const bulkConfirmSchema = z.object({ vocabularyItemIds: z.array(z.string().min(1)).min(1).max(200), idempotencyKey: z.string().min(1) });

/** Spec 13's "batch confirmation of reviewed mappings" — confirms several already-matched, already-reviewed items in one call instead of once per item. Never decides *which* candidate is right; that judgment still only happens per item in the mapping panel (see `mapping-queue-table.tsx`'s own docstring). */
export async function bulkConfirmVocabularyMappingsAction(
  input: z.infer<typeof bulkConfirmSchema>,
): Promise<ActionResult<{ confirmed: string[] }>> {
  return runDictionaryAction(async (actorUserId) => {
    const parsed = bulkConfirmSchema.parse(input);
    return bulkConfirmVocabularyMappings({ ...parsed, actorUserId });
  });
}

const selectSensesSchema = itemActionSchema.extend({ senseIds: z.array(z.string().min(1)).max(50) });

export async function selectSensesAction(input: z.infer<typeof selectSensesSchema>): Promise<ActionResult<string[]>> {
  return runDictionaryAction(async (actorUserId) => {
    const parsed = selectSensesSchema.parse(input);
    return selectVocabularySenses({ ...parsed, actorUserId });
  });
}

const selectPronunciationSchema = itemActionSchema.extend({ pronunciationId: z.string().min(1).nullable() });

export async function selectPronunciationAction(
  input: z.infer<typeof selectPronunciationSchema>,
): Promise<ActionResult<VocabularyDictionaryMapping>> {
  return runDictionaryAction(async (actorUserId) => {
    const parsed = selectPronunciationSchema.parse(input);
    return selectPreferredPronunciation({ ...parsed, actorUserId });
  });
}

const searchSchema = z.object({ languageId: z.string().min(1), query: z.string().trim().min(1).max(120) });

/**
 * Dictionary search for the "Change mapping" dialog. Read-only, so it is not
 * rate limited alongside the mutations — but it is still authorized, because
 * dictionary content is admin-only surface.
 */
export async function searchDictionaryAction(
  input: z.infer<typeof searchSchema>,
): Promise<ActionResult<DictionaryEntrySummary[]>> {
  return runDictionaryAction(async () => {
    const parsed = searchSchema.parse(input);
    return searchDictionary({ ...parsed, limit: 20 });
  });
}
