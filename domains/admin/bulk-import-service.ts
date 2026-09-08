import type { DbClient } from "@/db/client";
import { findDuplicateCandidates } from "@/domains/curriculum/curriculum-duplicate-detection";
import { createLearningItem as repoCreateLearningItem, getDuplicateCandidateRows, getNextPosition } from "@/domains/curriculum/curriculum-mutation-repository";
import { getLevelsByLanguage, getVocabularyGroupsByLanguage } from "@/domains/curriculum/curriculum-repository";
import type { DuplicateCandidate, GrammarFieldsInput, VocabularyFieldsInput } from "@/domains/curriculum/curriculum-mutation-types";
import type { ImportRowFieldIssue, ParsedImportFields, ValidatedImportRow } from "@/domains/curriculum/vocabulary-import-parsing";
import { withIdempotency } from "@/domains/idempotency";
import { AdminError } from "@/lib/errors/admin-errors";
import { normalizeForComparison } from "@/lib/answer-checking/normalize";

import { recordAuditEvent } from "./audit-repository";
import { invalidateCurriculumCache } from "./cache-invalidation";

/**
 * Orchestrates a bulk curriculum CSV/TSV import (vocabulary and grammar
 * both — see `vocabulary-import-parsing.ts`'s docstring for the
 * `GRAMMAR_GROUP_NUMBER` sentinel that decides which) on top of
 * already-existing primitives: `domains/curriculum`'s duplicate detection
 * and item creation (spec 11 rewrite), and
 * `domains/idempotency`/audit recording (this file's own
 * `publication-service.ts` sibling). Dictionary matching is a separate,
 * deliberately un-transactional follow-up step, run only over the
 * vocabulary items this creates — see
 * `domains/lexicon/lexicon-mapping-service.ts`'s `matchImportedVocabularyItems`.
 *
 * Two phases, matching `ai-workflow-rules.md`'s own "add admin CSV preview
 * validation" example unit shape:
 *
 * 1. `previewVocabularyImport` — read-only. Resolves each row's plain
 *    level/group numbers against the real database, checks every already-
 *    parsed row against existing curriculum and against every other row in
 *    the same file, so an admin can see and resolve every issue before
 *    anything is written.
 * 2. `bulkImportVocabulary` — the real write, re-resolving level/group and
 *    re-validating duplicates itself rather than trusting the preview's
 *    response (which is a separate request — something could have changed
 *    in between).
 */

export type ImportRowPreview = {
  rowNumber: number;
  raw: Record<string, string>;
  fields: ParsedImportFields | null;
  fieldIssues: ImportRowFieldIssue[];
  existingDuplicates: DuplicateCandidate[];
  /** The row number of the *first* row in this same file with the same normalized term/structure, if any — never itself. Vocabulary and grammar are compared separately, since they're different tables. */
  duplicateOfEarlierRow: number | null;
};

/** `level 1` -> that level's real id, and `(levelId, position)` -> that group's real id — both batched once per import, never per row. */
async function loadLevelAndGroupLookups(db: DbClient, languageId: string) {
  const [levelsForLanguage, groupsForLanguage] = await Promise.all([getLevelsByLanguage(db, languageId), getVocabularyGroupsByLanguage(db, languageId)]);
  const levelIdByNumber = new Map(levelsForLanguage.map((level) => [level.levelNumber, level.id]));
  const groupIdByLevelAndPosition = new Map(groupsForLanguage.map((group) => [`${group.levelId}:${group.position}`, group.id]));
  return { levelIdByNumber, groupIdByLevelAndPosition };
}

/** The term/structure a row's duplicate-detection and display revolve around, regardless of item type. */
function displayFormOf(fields: ParsedImportFields): string {
  return fields.itemType === "vocabulary" ? fields.term : fields.structure;
}

function itemResourceType(itemType: "vocabulary" | "grammar"): string {
  return itemType === "vocabulary" ? "vocabulary_item" : "grammar_item";
}

export async function previewVocabularyImport(
  db: DbClient,
  { languageId, validatedRows }: { languageId: string; validatedRows: ValidatedImportRow[] },
): Promise<ImportRowPreview[]> {
  const [candidateVocabRows, candidateGrammarRows, { levelIdByNumber, groupIdByLevelAndPosition }] = await Promise.all([
    getDuplicateCandidateRows(db, languageId, "vocabulary"),
    getDuplicateCandidateRows(db, languageId, "grammar"),
    loadLevelAndGroupLookups(db, languageId),
  ]);
  const firstRowNumberByKey = new Map<string, number>();

  return validatedRows.map((row): ImportRowPreview => {
    if (!row.fields) {
      return { rowNumber: row.rowNumber, raw: row.raw, fields: null, fieldIssues: row.fieldIssues, existingDuplicates: [], duplicateOfEarlierRow: null };
    }

    const levelId = levelIdByNumber.get(row.fields.levelNumber);
    if (!levelId) {
      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        fields: null,
        fieldIssues: [{ field: "level", message: `Level ${row.fields.levelNumber} doesn't exist yet.` }],
        existingDuplicates: [],
        duplicateOfEarlierRow: null,
      };
    }

    if (row.fields.itemType === "vocabulary" && !groupIdByLevelAndPosition.has(`${levelId}:${row.fields.groupNumber}`)) {
      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        fields: null,
        fieldIssues: [{ field: "group", message: `Level ${row.fields.levelNumber} has no group ${row.fields.groupNumber} yet.` }],
        existingDuplicates: [],
        duplicateOfEarlierRow: null,
      };
    }

    const displayForm = displayFormOf(row.fields);
    const key = `${row.fields.itemType}:${normalizeForComparison(displayForm)}`;
    const candidateRows = row.fields.itemType === "vocabulary" ? candidateVocabRows : candidateGrammarRows;
    const existingDuplicates = findDuplicateCandidates(displayForm, candidateRows);
    const duplicateOfEarlierRow = firstRowNumberByKey.get(key) ?? null;
    if (duplicateOfEarlierRow === null) firstRowNumberByKey.set(key, row.rowNumber);

    return { rowNumber: row.rowNumber, raw: row.raw, fields: row.fields, fieldIssues: [], existingDuplicates, duplicateOfEarlierRow };
  });
}

export type ImportRowDecision = {
  fields: ParsedImportFields;
  /** The admin's call for this row, from the preview — every row needs one, even a clean row (defaults to "import" client-side). Skipped rows are simply omitted, never an error. */
  decision: "import" | "skip";
};

export type BulkImportVocabularyServiceInput = {
  languageId: string;
  actorUserId: string;
  idempotencyKey: string;
  rows: ImportRowDecision[];
};

export type BulkImportVocabularyResult = { createdVocabularyItemIds: string[]; createdGrammarItemIds: string[] };

/**
 * The real write. Re-resolves each row's level/group numbers and
 * re-derives duplicates itself (never trusts a client-sent "this row
 * is/isn't a duplicate" flag, or a client-sent id, as proof) using one
 * shared lookup fetched once for the whole batch — not refetched per row,
 * since nothing about it changes mid-transaction. A row whose decision is
 * "import" is created unconditionally, even over a real duplicate — that
 * decision *is* the admin's homonym approval, mirrored as a
 * `DUPLICATE_APPROVED` audit event exactly like the single-item flow's.
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
      payload: { languageId: input.languageId, rows: importedRows.map((row) => ({ itemType: row.fields.itemType, levelNumber: row.fields.levelNumber, displayForm: displayFormOf(row.fields) })) },
    },
    async (tx) => {
      const [candidateVocabRows, candidateGrammarRows, { levelIdByNumber, groupIdByLevelAndPosition }] = await Promise.all([
        getDuplicateCandidateRows(tx, input.languageId, "vocabulary"),
        getDuplicateCandidateRows(tx, input.languageId, "grammar"),
        loadLevelAndGroupLookups(tx, input.languageId),
      ]);

      const createdVocabularyItemIds: string[] = [];
      const createdGrammarItemIds: string[] = [];

      for (const row of importedRows) {
        const levelId = levelIdByNumber.get(row.fields.levelNumber);
        if (!levelId) throw new AdminError("CURRICULUM_VALIDATION_FAILED", `Level ${row.fields.levelNumber} no longer exists.`);

        const displayForm = displayFormOf(row.fields);
        const candidateRows = row.fields.itemType === "vocabulary" ? candidateVocabRows : candidateGrammarRows;
        const existingDuplicates = findDuplicateCandidates(displayForm, candidateRows);
        const position = await getNextPosition(tx, levelId, row.fields.itemType);

        let learningItemId: string;
        if (row.fields.itemType === "vocabulary") {
          const vocab = row.fields;
          const groupId = groupIdByLevelAndPosition.get(`${levelId}:${vocab.groupNumber}`);
          if (!groupId) throw new AdminError("CURRICULUM_VALIDATION_FAILED", `Level ${vocab.levelNumber} no longer has group ${vocab.groupNumber}.`);

          const fields: VocabularyFieldsInput = {
            vocabularyGroupId: groupId,
            term: vocab.term,
            primaryMeaning: vocab.primaryMeaning,
            definition: vocab.definition,
            article: vocab.article,
            partOfSpeech: vocab.partOfSpeech,
            pronunciation: vocab.pronunciation,
            ipa: vocab.ipa,
            context: vocab.context,
            creatorNotes: vocab.creatorNotes,
            acceptedAnswers: vocab.acceptedAnswers,
          };
          learningItemId = await repoCreateLearningItem(tx, { languageId: input.languageId, levelId, position, lessonPriority: position, type: "vocabulary", fields });
          createdVocabularyItemIds.push(learningItemId);
          await recordAuditEvent(tx, { actorUserId: input.actorUserId, action: "CURRICULUM_ITEM_CREATED", resourceType: "vocabulary_item", resourceId: learningItemId, afterData: fields, correlationId: input.idempotencyKey });
        } else {
          const grammar = row.fields;
          const fields: GrammarFieldsInput = {
            title: grammar.title,
            structure: grammar.structure,
            primaryMeaning: grammar.primaryMeaning,
            explanation: grammar.explanation,
            category: grammar.category,
            creatorNotes: grammar.creatorNotes,
            requiredQuestions: grammar.requiredQuestions,
            acceptedAnswers: grammar.acceptedAnswers,
          };
          learningItemId = await repoCreateLearningItem(tx, { languageId: input.languageId, levelId, position, lessonPriority: position, type: "grammar", fields });
          createdGrammarItemIds.push(learningItemId);
          await recordAuditEvent(tx, { actorUserId: input.actorUserId, action: "CURRICULUM_ITEM_CREATED", resourceType: "grammar_item", resourceId: learningItemId, afterData: fields, correlationId: input.idempotencyKey });
        }

        if (existingDuplicates.length > 0) {
          await recordAuditEvent(tx, {
            actorUserId: input.actorUserId,
            action: "DUPLICATE_APPROVED",
            resourceType: itemResourceType(row.fields.itemType),
            resourceId: learningItemId,
            afterData: { approvedAsHomonymOf: existingDuplicates[0]!.learningItemId },
            correlationId: input.idempotencyKey,
          });
        }
      }

      invalidateCurriculumCache(input.languageId);
      return { createdVocabularyItemIds, createdGrammarItemIds };
    },
  );
}
