import type { DbClient } from "@/db/client";
import { findDuplicateCandidates } from "@/domains/curriculum/curriculum-duplicate-detection";
import { createLearningItem as repoCreateLearningItem, getDuplicateCandidateRows, getNextPosition } from "@/domains/curriculum/curriculum-mutation-repository";
import type { DuplicateCandidate, VocabularyFieldsInput } from "@/domains/curriculum/curriculum-mutation-types";
import type { ImportRowFieldIssue, ParsedVocabularyFields, ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import { withIdempotency } from "@/domains/idempotency";
import { AdminError } from "@/lib/errors/admin-errors";
import { normalizeForComparison } from "@/lib/answer-checking/normalize";

import { recordAuditEvent } from "./audit-repository";
import { invalidateCurriculumCache } from "./cache-invalidation";

/**
 * Spec 13's "Curriculum Authoring at Volume" — orchestrates a bulk
 * vocabulary CSV/TSV import on top of already-existing primitives:
 * `domains/curriculum`'s duplicate detection and item creation (spec 11
 * rewrite), and `domains/idempotency`/audit recording (this file's own
 * `publication-service.ts` sibling). Dictionary matching is a separate,
 * deliberately un-transactional follow-up step — see
 * `domains/lexicon/lexicon-mapping-service.ts`'s `matchImportedVocabularyItems`.
 *
 * Two phases, matching `ai-workflow-rules.md`'s own "add admin CSV preview
 * validation" example unit shape:
 *
 * 1. `previewVocabularyImport` — read-only. Checks every already-parsed row
 *    against existing curriculum and against every other row in the same
 *    file, so an admin can see and resolve every issue before anything is
 *    written.
 * 2. `bulkImportVocabulary` — the real write, re-validating duplicates
 *    itself rather than trusting the preview's response (which is a
 *    separate request — something could have changed in between).
 */

export type ImportRowPreview = {
  rowNumber: number;
  raw: Record<string, string>;
  fields: ParsedVocabularyFields | null;
  fieldIssues: ImportRowFieldIssue[];
  existingDuplicates: DuplicateCandidate[];
  /** The row number of the *first* row in this same file with the same normalized term, if any — never itself. */
  duplicateOfEarlierRow: number | null;
};

export async function previewVocabularyImport(
  db: DbClient,
  { languageId, validatedRows }: { languageId: string; validatedRows: ValidatedImportRow[] },
): Promise<ImportRowPreview[]> {
  const candidateRows = await getDuplicateCandidateRows(db, languageId, "vocabulary");
  const firstRowNumberByNormalizedTerm = new Map<string, number>();

  return validatedRows.map((row): ImportRowPreview => {
    if (!row.fields) {
      return { rowNumber: row.rowNumber, raw: row.raw, fields: null, fieldIssues: row.fieldIssues, existingDuplicates: [], duplicateOfEarlierRow: null };
    }

    const normalizedTerm = normalizeForComparison(row.fields.term);
    const existingDuplicates = findDuplicateCandidates(row.fields.term, candidateRows);
    const duplicateOfEarlierRow = firstRowNumberByNormalizedTerm.get(normalizedTerm) ?? null;
    if (duplicateOfEarlierRow === null) firstRowNumberByNormalizedTerm.set(normalizedTerm, row.rowNumber);

    return { rowNumber: row.rowNumber, raw: row.raw, fields: row.fields, fieldIssues: [], existingDuplicates, duplicateOfEarlierRow };
  });
}

export type ImportRowDecision = {
  fields: ParsedVocabularyFields;
  /** The admin's call for this row, from the preview — every row needs one, even a clean row (defaults to "import" client-side). Skipped rows are simply omitted, never an error. */
  decision: "import" | "skip";
};

export type BulkImportVocabularyServiceInput = {
  languageId: string;
  levelId: string;
  vocabularyGroupId: string;
  actorUserId: string;
  idempotencyKey: string;
  rows: ImportRowDecision[];
};

export type BulkImportVocabularyResult = { createdLearningItemIds: string[] };

/**
 * The real write. Re-derives duplicates itself (never trusts a client-sent
 * "this row is/isn't a duplicate" flag as proof) using one
 * `getDuplicateCandidateRows` fetch shared across every row in the batch —
 * not refetched per row, since nothing about it changes mid-transaction.
 * A row whose decision is "import" is created unconditionally, even over a
 * real duplicate — that decision *is* the admin's homonym approval, mirrored
 * as a `DUPLICATE_APPROVED` audit event exactly like the single-item flow's.
 */
export async function bulkImportVocabulary(db: DbClient, input: BulkImportVocabularyServiceInput): Promise<BulkImportVocabularyResult> {
  const importedRows = input.rows.filter((row) => row.decision === "import");
  if (importedRows.length === 0) {
    throw new AdminError("CURRICULUM_VALIDATION_FAILED", "Nothing was selected to import.");
  }

  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-import-vocabulary",
      key: input.idempotencyKey,
      payload: { languageId: input.languageId, levelId: input.levelId, vocabularyGroupId: input.vocabularyGroupId, terms: importedRows.map((row) => row.fields.term) },
    },
    async (tx) => {
      const candidateRows = await getDuplicateCandidateRows(tx, input.languageId, "vocabulary");
      const createdLearningItemIds: string[] = [];

      for (const row of importedRows) {
        const existingDuplicates = findDuplicateCandidates(row.fields.term, candidateRows);

        const position = await getNextPosition(tx, input.levelId, "vocabulary");
        const fields: VocabularyFieldsInput = { ...row.fields, vocabularyGroupId: input.vocabularyGroupId };
        const learningItemId = await repoCreateLearningItem(tx, {
          languageId: input.languageId,
          levelId: input.levelId,
          position,
          lessonPriority: position,
          type: "vocabulary",
          fields,
        });
        createdLearningItemIds.push(learningItemId);

        if (existingDuplicates.length > 0) {
          await recordAuditEvent(tx, {
            actorUserId: input.actorUserId,
            action: "DUPLICATE_APPROVED",
            resourceType: "vocabulary_item",
            resourceId: learningItemId,
            afterData: { approvedAsHomonymOf: existingDuplicates[0]!.learningItemId },
            correlationId: input.idempotencyKey,
          });
        }
        await recordAuditEvent(tx, {
          actorUserId: input.actorUserId,
          action: "CURRICULUM_ITEM_CREATED",
          resourceType: "vocabulary_item",
          resourceId: learningItemId,
          afterData: fields,
          correlationId: input.idempotencyKey,
        });
      }

      invalidateCurriculumCache(input.languageId);
      return { createdLearningItemIds };
    },
  );
}
