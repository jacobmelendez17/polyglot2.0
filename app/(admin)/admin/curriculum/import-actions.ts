"use server";

import { z } from "zod";

import { canManageCurriculum } from "@/domains/admin";
import { bulkImportVocabulary, previewVocabularyImport } from "@/domains/admin/server";
import type { ImportRowPreview } from "@/domains/admin/server";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, validateVocabularyImportRow } from "@/domains/curriculum";
import { parseVocabularyImportFile } from "@/domains/curriculum/vocabulary-import-file-parser";
import { matchImportedVocabularyItems } from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";
import { AdminError } from "@/lib/errors/admin-errors";

/**
 * Server Action entry points for spec 13's bulk vocabulary import. Kept
 * separate from `./actions.ts` rather than added to it — a different
 * payload shape (raw file text, not a single item's fields) and a two-phase
 * preview/confirm flow, mirroring why `domains/admin/bulk-import-service.ts`
 * is its own file rather than added to `publication-service.ts`.
 *
 * Follows `actions.ts`/`app/(admin)/admin/dictionary/actions.ts`'s exact
 * established shape independently (this codebase deliberately keeps each
 * action file's own auth-wrapper local rather than sharing one — see
 * `lib/errors/*.ts`'s identical per-workflow separation) rather than a new
 * pattern: Zod-validated, re-authenticates and re-checks
 * `canManageCurriculum` on every call, business rules stay in
 * `domains/admin`/`domains/curriculum`/`domains/lexicon`.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

async function runImportAction<T>(fn: (actorUserId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    if (!canManageCurriculum(user)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "You don't have access to do that." } };
    }
    return { ok: true, data: await fn(user.id) };
  } catch (error) {
    if (error instanceof AdminError) {
      return { ok: false, error: { code: error.code, message: error.message, details: error.details } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "CURRICULUM_VALIDATION_FAILED", message: "That request could not be understood." } };
    }
    console.error("Unexpected import action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const previewInputSchema = z.object({
  languageId: z.string().min(1),
  fileContent: z.string().min(1).max(MAX_IMPORT_FILE_BYTES),
  delimiter: z.enum([",", "\t"]),
});

export type ImportPreviewResult = { fileError: null; rows: ImportRowPreview[] } | { fileError: { type: string; message: string }; rows: [] };

/** Read-only: parses and validates, but writes nothing. The admin reviews this before `bulkImportVocabularyAction` ever runs. */
export async function previewVocabularyImportAction(input: z.infer<typeof previewInputSchema>): Promise<ActionResult<ImportPreviewResult>> {
  return runImportAction(async (actorUserId) => {
    const parsed = previewInputSchema.parse(input);
    const parseResult = parseVocabularyImportFile(parsed.fileContent, parsed.delimiter);
    if (!parseResult.ok) {
      const message =
        parseResult.error.type === "missing_columns"
          ? `Missing required column(s): ${parseResult.error.columns.join(", ")}.`
          : parseResult.error.type === "too_many_rows"
            ? `This file has ${parseResult.error.count} rows — the limit is ${MAX_IMPORT_ROWS}.`
            : parseResult.error.message;
      return { fileError: { type: parseResult.error.type, message }, rows: [] };
    }

    const validatedRows = parseResult.rows.map((row, index) => validateVocabularyImportRow(row, index));
    const rows = await previewVocabularyImport({ languageId: parsed.languageId, actorUserId, validatedRows });
    return { fileError: null, rows };
  });
}

const acceptedAnswerSchema = z.object({ side: z.enum(["term", "meaning"]), value: z.string().trim().min(1) });

const grammarQuestionRequirementSchema = z.object({ format: z.literal("translation"), direction: z.enum(["targetToEnglish", "englishToTarget"]) });

const importVocabularyFieldsSchema = z.object({
  itemType: z.literal("vocabulary"),
  levelNumber: z.number().int().min(1),
  groupNumber: z.number().int().min(1),
  term: z.string().trim().min(1),
  primaryMeaning: z.string().trim().min(1),
  partOfSpeech: z.string().trim(),
  definition: z.string().trim().min(1).nullish(),
  article: z.string().trim().min(1).nullish(),
  pronunciation: z.string().trim().min(1).nullish(),
  ipa: z.string().trim().min(1).nullish(),
  context: z.string().trim().min(1).nullish(),
  creatorNotes: z.string().trim().min(1).nullish(),
  acceptedAnswers: z.array(acceptedAnswerSchema),
});

const importGrammarFieldsSchema = z.object({
  itemType: z.literal("grammar"),
  levelNumber: z.number().int().min(1),
  title: z.string().trim().min(1).nullish(),
  structure: z.string().trim().min(1),
  primaryMeaning: z.string().trim().min(1),
  explanation: z.string().trim(),
  category: z.string().trim().min(1).nullish(),
  creatorNotes: z.string().trim().min(1).nullish(),
  requiredQuestions: z.array(grammarQuestionRequirementSchema),
  acceptedAnswers: z.array(acceptedAnswerSchema),
});

const importRowDecisionSchema = z.object({
  fields: z.discriminatedUnion("itemType", [importVocabularyFieldsSchema, importGrammarFieldsSchema]),
  decision: z.enum(["import", "skip"]),
});

const bulkImportInputSchema = z.object({
  languageId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  rows: z.array(importRowDecisionSchema).min(1).max(MAX_IMPORT_ROWS),
});

export type BulkImportSummary = {
  createdCount: number;
  /** Keyed by `DictionaryMatchStatus` — how the newly created *vocabulary* items resolved against the Lexicon after creation. Grammar items never enter this (spec 12: "Lexicon applies to vocabulary only"). */
  matched: Record<string, number>;
};

/** The real write: creates every "import"-decided row, then runs Lexicon matching on exactly the vocabulary items it just created. */
export async function bulkImportVocabularyAction(input: z.infer<typeof bulkImportInputSchema>): Promise<ActionResult<BulkImportSummary>> {
  return runImportAction(async (actorUserId) => {
    const parsed = bulkImportInputSchema.parse(input);
    const { createdVocabularyItemIds, createdGrammarItemIds } = await bulkImportVocabulary({ ...parsed, actorUserId });
    const matchSummary =
      createdVocabularyItemIds.length > 0
        ? await matchImportedVocabularyItems({ vocabularyItemIds: createdVocabularyItemIds, actorUserId })
        : { processed: 0, skippedLocked: 0, byStatus: {} };
    return { createdCount: createdVocabularyItemIds.length + createdGrammarItemIds.length, matched: matchSummary.byStatus };
  });
}
