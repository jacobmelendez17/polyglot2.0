import { z } from "zod";

import { MAPPING_REVIEW_REASONS } from "./lexicon-types";

/**
 * Boundary validation for every Lexicon mutation and query that accepts
 * outside input (code-standards.md: validate untrusted data at runtime with
 * Zod). Server Actions parse against these before any domain function runs —
 * a client-supplied sense id or entry id is a request, never proof.
 */

/**
 * Permissive UUID-shape check rather than `z.uuid()`, for the reason
 * `domains/admin/audit-schemas.ts` documents at length: this codebase's
 * seeded fixture ids are valid Postgres `uuid` values but not RFC 4122
 * version/variant compliant, and `z.uuid()` rejects them.
 */
const uuidLike = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID");

export const matchStatusSchema = z.enum([
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "review_required",
  "manual",
]);

export const regionalEvidenceStatusSchema = z.enum(["recognized", "not_listed", "unknown"]);

export const mappingReviewReasonSchema = z.enum(MAPPING_REVIEW_REASONS);

export const rematchVocabularyItemInputSchema = z.object({
  vocabularyItemId: uuidLike,
  actorUserId: uuidLike,
  idempotencyKey: uuidLike,
});

export const setManualMappingInputSchema = z.object({
  vocabularyItemId: uuidLike,
  dictionaryEntryId: uuidLike,
  actorUserId: uuidLike,
  idempotencyKey: uuidLike,
});

export const confirmMappingInputSchema = z.object({
  vocabularyItemId: uuidLike,
  actorUserId: uuidLike,
  idempotencyKey: uuidLike,
});

export const selectSensesInputSchema = z.object({
  vocabularyItemId: uuidLike,
  // Bounded: a dictionary entry with more than this many senses exists, but
  // a curriculum item teaching more than this many of them does not, and an
  // unbounded array is an easy way to make one request do unbounded work.
  senseIds: z.array(uuidLike).max(50),
  actorUserId: uuidLike,
  idempotencyKey: uuidLike,
});

export const selectPronunciationInputSchema = z.object({
  vocabularyItemId: uuidLike,
  pronunciationId: uuidLike.nullable(),
  actorUserId: uuidLike,
  idempotencyKey: uuidLike,
});

export const searchDictionaryInputSchema = z.object({
  languageId: uuidLike,
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50),
});

export const mappingQueueInputSchema = z.object({
  languageId: uuidLike,
  levelId: uuidLike.optional(),
  vocabularyGroupId: uuidLike.optional(),
  matchStatus: matchStatusSchema.optional(),
  partOfSpeech: z.string().trim().min(1).max(64).optional(),
  regionCode: z.string().trim().min(2).max(16).optional(),
  regionalStatus: regionalEvidenceStatusSchema.optional(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
});

export type RematchVocabularyItemInput = z.infer<typeof rematchVocabularyItemInputSchema>;
export type SetManualMappingInput = z.infer<typeof setManualMappingInputSchema>;
export type ConfirmMappingInput = z.infer<typeof confirmMappingInputSchema>;
export type SelectSensesInput = z.infer<typeof selectSensesInputSchema>;
export type SelectPronunciationInput = z.infer<typeof selectPronunciationInputSchema>;
export type SearchDictionaryInput = z.infer<typeof searchDictionaryInputSchema>;
export type MappingQueueInput = z.infer<typeof mappingQueueInputSchema>;
