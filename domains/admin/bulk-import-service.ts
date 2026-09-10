import type { DbClient } from "@/db/client";
import { findDuplicateCandidates } from "@/domains/curriculum/curriculum-duplicate-detection";
import {
  createLearningItem as repoCreateLearningItem,
  getAcceptedAnswers,
  getDuplicateCandidateRows,
  getImportMatchTargets,
  getNextPosition,
  moveLearningItem,
  saveDraft as repoSaveDraft,
  updateGrammarFieldsFromImport,
  updateVocabularyFieldsFromImport,
} from "@/domains/curriculum/curriculum-mutation-repository";
import type { ImportMatchTarget } from "@/domains/curriculum/curriculum-mutation-repository";
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

/**
 * What a row will do to the curriculum (spec 17). Re-importing a corrected
 * file is now an ordinary thing to do, so every row says which of these it
 * is *before* anything is written.
 */
export type ImportRowAction = "create" | "update" | "move" | "unchanged" | "blocked";

export type ImportFieldChange = { field: string; from: string | null; to: string | null };

export type ImportRowPlacementChange = {
  fromLevelNumber: number;
  toLevelNumber: number;
  fromGroupNumber: number | null;
  toGroupNumber: number | null;
};

export type ImportRowPreview = {
  rowNumber: number;
  raw: Record<string, string>;
  fields: ParsedImportFields | null;
  fieldIssues: ImportRowFieldIssue[];
  action: ImportRowAction;
  /** The existing item this row resolved to, for every action but `create`. */
  matchedItemId: string | null;
  /** Why a row cannot be imported — an archived item, which is reported rather than silently revived. */
  blockedReason: string | null;
  /** The fields this row would change on the matched item, empty for a create. */
  changes: ImportFieldChange[];
  /** Set when the row places an existing item in a different level or group. */
  placement: ImportRowPlacementChange | null;
  /** True when the matched item is published, so the update lands in its draft for an Admin to publish. */
  savesAsDraft: boolean;
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

/** The fields an import row can carry for each item type, in the order a preview lists them. */
const IMPORTABLE_FIELDS = {
  vocabulary: ["primaryMeaning", "definition", "article", "partOfSpeech", "pronunciation", "ipa", "context", "creatorNotes"],
  grammar: ["primaryMeaning", "title", "explanation", "category", "creatorNotes"],
} as const;

/**
 * What one row of the file carries, as plain values. A field the file does
 * not provide — an absent column, or a blank cell — is `null`, which
 * everything downstream reads as "say nothing about this", never as "clear
 * it".
 */
function importedValues(fields: ParsedImportFields): Record<string, string | null> {
  if (fields.itemType === "vocabulary") {
    return {
      primaryMeaning: fields.primaryMeaning,
      definition: fields.definition ?? null,
      article: fields.article ?? null,
      partOfSpeech: fields.partOfSpeech || null,
      pronunciation: fields.pronunciation ?? null,
      ipa: fields.ipa ?? null,
      context: fields.context ?? null,
      creatorNotes: fields.creatorNotes ?? null,
    };
  }
  return {
    primaryMeaning: fields.primaryMeaning,
    title: fields.title ?? null,
    explanation: fields.explanation || null,
    category: fields.category ?? null,
    creatorNotes: fields.creatorNotes ?? null,
  };
}

type ResolvedImportRow =
  | { kind: "invalid"; fieldIssues: ImportRowFieldIssue[] }
  | {
      kind: "resolved";
      fields: ParsedImportFields;
      levelId: string;
      groupId: string | null;
      target: ImportMatchTarget | null;
      action: ImportRowAction;
      blockedReason: string | null;
      changes: ImportFieldChange[];
      placement: ImportRowPlacementChange | null;
      savesAsDraft: boolean;
    };

type ImportLookups = {
  levelIdByNumber: Map<number, string>;
  groupIdByLevelAndPosition: Map<string, string>;
  /**
   * Every item sharing a term, not just one — a term can legitimately belong
   * to several rows: an archived item the curriculum has moved past, or two
   * approved homonyms.
   */
  targetsByType: { vocabulary: Map<string, ImportMatchTarget[]>; grammar: Map<string, ImportMatchTarget[]> };
};

/**
 * Picks the item a row updates when several share its term.
 *
 * An archived item never shadows a live one. Level 1's original demo words
 * were archived when the authored curriculum replaced them, and matching
 * those instead of the real items blocked `rojo` and `y` on the very first
 * re-import — caught by running it, not by reading it.
 *
 * Two *live* items sharing a term are approved homonyms, and a file with one
 * term column cannot say which it means. That is reported rather than
 * guessed at.
 */
function chooseMatchTarget(matches: ImportMatchTarget[]): { target: ImportMatchTarget | null; blockedReason: string | null } {
  if (matches.length === 0) return { target: null, blockedReason: null };

  const live = matches.filter((match) => match.status !== "archived");
  if (live.length === 1) return { target: live[0]!, blockedReason: null };
  if (live.length > 1) {
    return {
      target: null,
      blockedReason: `This word exists ${live.length} times in the curriculum, so a file cannot say which one to update. Edit them in Admin instead.`,
    };
  }
  return { target: null, blockedReason: "This word is archived. Restore it in Admin before re-importing it." };
}

/**
 * Decides what one row does — the single place that answer is computed
 * (spec 17). The preview reports it and the commit applies it, so the two
 * can never disagree about what an admin approved; the commit still calls
 * this itself against freshly loaded data rather than trusting a preview
 * response from an earlier request.
 */
function resolveImportRow(row: ValidatedImportRow, lookups: ImportLookups): ResolvedImportRow {
  if (!row.fields) return { kind: "invalid", fieldIssues: row.fieldIssues };

  const levelId = lookups.levelIdByNumber.get(row.fields.levelNumber);
  if (!levelId) {
    return { kind: "invalid", fieldIssues: [{ field: "level", message: `Level ${row.fields.levelNumber} doesn't exist yet.` }] };
  }

  let groupId: string | null = null;
  if (row.fields.itemType === "vocabulary") {
    groupId = lookups.groupIdByLevelAndPosition.get(`${levelId}:${row.fields.groupNumber}`) ?? null;
    if (!groupId) {
      return { kind: "invalid", fieldIssues: [{ field: "group", message: `Level ${row.fields.levelNumber} has no group ${row.fields.groupNumber} yet.` }] };
    }
  }

  const matches = lookups.targetsByType[row.fields.itemType].get(normalizeForComparison(displayFormOf(row.fields))) ?? [];
  const { target, blockedReason } = chooseMatchTarget(matches);
  const base = { kind: "resolved" as const, fields: row.fields, levelId, groupId, target };

  if (blockedReason) {
    return { ...base, action: "blocked", blockedReason, changes: [], placement: null, savesAsDraft: false };
  }

  if (!target) {
    return { ...base, action: "create", blockedReason: null, changes: [], placement: null, savesAsDraft: false };
  }

  // A field an author has taken over is never rewritten by a file (spec 17),
  // exactly as it is never rewritten by the dictionary.
  const overridden = new Set<string>(target.dictionaryFieldOverrides);
  const values = importedValues(row.fields);
  const changes = IMPORTABLE_FIELDS[row.fields.itemType]
    .filter((field) => !overridden.has(field))
    .flatMap((field): ImportFieldChange[] => {
      const to = values[field] ?? null;
      const from = target.current[field] ?? null;
      return to === null || to === from ? [] : [{ field, from, to }];
    });

  const groupNumber = row.fields.itemType === "vocabulary" ? row.fields.groupNumber : null;
  const movesLevel = target.levelNumber !== row.fields.levelNumber;
  const movesGroup = groupNumber !== null && target.groupNumber !== groupNumber;
  const placement =
    movesLevel || movesGroup
      ? {
          fromLevelNumber: target.levelNumber,
          toLevelNumber: row.fields.levelNumber,
          fromGroupNumber: target.groupNumber,
          toGroupNumber: groupNumber,
        }
      : null;

  const action: ImportRowAction = placement ? "move" : changes.length > 0 ? "update" : "unchanged";
  return { ...base, action, blockedReason: null, changes, placement, savesAsDraft: target.status === "published" };
}

function groupByTerm(targets: ImportMatchTarget[]): Map<string, ImportMatchTarget[]> {
  const byTerm = new Map<string, ImportMatchTarget[]>();
  for (const target of targets) {
    const existing = byTerm.get(target.normalizedTerm) ?? [];
    existing.push(target);
    byTerm.set(target.normalizedTerm, existing);
  }
  return byTerm;
}

async function loadImportLookups(db: DbClient, languageId: string): Promise<ImportLookups> {
  const [{ levelIdByNumber, groupIdByLevelAndPosition }, vocabularyTargets, grammarTargets] = await Promise.all([
    loadLevelAndGroupLookups(db, languageId),
    getImportMatchTargets(db, languageId, "vocabulary"),
    getImportMatchTargets(db, languageId, "grammar"),
  ]);
  return {
    levelIdByNumber,
    groupIdByLevelAndPosition,
    targetsByType: { vocabulary: groupByTerm(vocabularyTargets), grammar: groupByTerm(grammarTargets) },
  };
}

export async function previewVocabularyImport(
  db: DbClient,
  { languageId, validatedRows }: { languageId: string; validatedRows: ValidatedImportRow[] },
): Promise<ImportRowPreview[]> {
  const [candidateVocabRows, candidateGrammarRows, lookups] = await Promise.all([
    getDuplicateCandidateRows(db, languageId, "vocabulary"),
    getDuplicateCandidateRows(db, languageId, "grammar"),
    loadImportLookups(db, languageId),
  ]);
  const firstRowNumberByKey = new Map<string, number>();

  return validatedRows.map((row): ImportRowPreview => {
    const empty = {
      rowNumber: row.rowNumber,
      raw: row.raw,
      matchedItemId: null,
      blockedReason: null,
      changes: [],
      placement: null,
      savesAsDraft: false,
      existingDuplicates: [],
      duplicateOfEarlierRow: null,
    };

    const resolved = resolveImportRow(row, lookups);
    if (resolved.kind === "invalid") {
      return { ...empty, fields: null, fieldIssues: resolved.fieldIssues, action: "blocked" };
    }

    const displayForm = displayFormOf(resolved.fields);
    const key = `${resolved.fields.itemType}:${normalizeForComparison(displayForm)}`;
    const candidateRows = resolved.fields.itemType === "vocabulary" ? candidateVocabRows : candidateGrammarRows;
    // The item this row updates is not a duplicate of itself (spec 17):
    // an exact term match is now an update, so homonym approval is left for
    // genuinely different items.
    const existingDuplicates = findDuplicateCandidates(displayForm, candidateRows).filter(
      (candidate) => candidate.learningItemId !== resolved.target?.learningItemId,
    );
    const duplicateOfEarlierRow = firstRowNumberByKey.get(key) ?? null;
    if (duplicateOfEarlierRow === null) firstRowNumberByKey.set(key, row.rowNumber);

    return {
      ...empty,
      fields: resolved.fields,
      fieldIssues: [],
      action: resolved.action,
      matchedItemId: resolved.target?.learningItemId ?? null,
      blockedReason: resolved.blockedReason,
      changes: resolved.changes,
      placement: resolved.placement,
      savesAsDraft: resolved.savesAsDraft,
      existingDuplicates,
      duplicateOfEarlierRow,
    };
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

export type BulkImportVocabularyResult = {
  createdVocabularyItemIds: string[];
  createdGrammarItemIds: string[];
  /** Existing items whose content this import changed — their IDs, and therefore all learner progress, are unchanged. */
  updatedVocabularyItemIds: string[];
  updatedGrammarItemIds: string[];
  movedItemIds: string[];
  /** Published items whose update landed in a draft rather than live, awaiting an Admin publish. */
  draftedItemIds: string[];
  /** Rows that matched an item the file would not change. */
  unchangedCount: number;
  /** Rows that could not be applied — an archived item is reported, never silently revived. */
  blocked: { displayForm: string; reason: string }[];
};

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
      const lookups = await loadImportLookups(tx, input.languageId);

      const result: BulkImportVocabularyResult = {
        createdVocabularyItemIds: [],
        createdGrammarItemIds: [],
        updatedVocabularyItemIds: [],
        updatedGrammarItemIds: [],
        movedItemIds: [],
        draftedItemIds: [],
        unchangedCount: 0,
        blocked: [],
      };

      for (const row of importedRows) {
        // Re-resolved here rather than trusted from the preview, which was a
        // separate request: the curriculum may have moved underneath it.
        const resolved = resolveImportRow({ rowNumber: 0, raw: {}, fields: row.fields, fieldIssues: [] }, lookups);
        if (resolved.kind === "invalid") {
          throw new AdminError("CURRICULUM_VALIDATION_FAILED", resolved.fieldIssues[0]?.message ?? "This file no longer matches the curriculum.");
        }

        const displayForm = displayFormOf(resolved.fields);

        if (resolved.action === "blocked") {
          result.blocked.push({ displayForm, reason: resolved.blockedReason ?? "This row cannot be imported." });
          continue;
        }

        if (resolved.action === "unchanged") {
          result.unchangedCount += 1;
          continue;
        }

        if (resolved.target) {
          await applyImportUpdate(tx, { resolved, target: resolved.target, actorUserId: input.actorUserId, correlationId: input.idempotencyKey, result });
          continue;
        }

        await applyImportCreate(tx, { resolved, languageId: input.languageId, actorUserId: input.actorUserId, correlationId: input.idempotencyKey, lookups, result });
      }

      invalidateCurriculumCache(input.languageId);
      return result;
    },
  );
}

type ApplyContext = {
  resolved: Extract<ResolvedImportRow, { kind: "resolved" }>;
  actorUserId: string;
  correlationId: string;
  result: BulkImportVocabularyResult;
};

/**
 * Creates a brand-new item.
 *
 * No homonym approval here any more: duplicate detection and this file's
 * matching normalize the same display form the same way, so a row that would
 * have been "a duplicate to approve" is now the update of the item it
 * duplicates. A second item with the same spelling is a deliberate act, and
 * belongs in Admin where the two can be told apart — a file with one term
 * column cannot express it.
 */
async function applyImportCreate(
  tx: DbClient,
  { resolved, languageId, actorUserId, correlationId, lookups, result }: ApplyContext & { languageId: string; lookups: ImportLookups },
): Promise<void> {
  const { fields, levelId, groupId } = resolved;
  const position = await getNextPosition(tx, levelId, fields.itemType);

  let learningItemId: string;
  if (fields.itemType === "vocabulary") {
    if (!groupId) throw new AdminError("CURRICULUM_VALIDATION_FAILED", `Level ${fields.levelNumber} no longer has group ${fields.groupNumber}.`);
    const vocabularyFields: VocabularyFieldsInput = {
      vocabularyGroupId: groupId,
      term: fields.term,
      primaryMeaning: fields.primaryMeaning,
      definition: fields.definition,
      article: fields.article,
      partOfSpeech: fields.partOfSpeech,
      pronunciation: fields.pronunciation,
      ipa: fields.ipa,
      context: fields.context,
      creatorNotes: fields.creatorNotes,
      acceptedAnswers: fields.acceptedAnswers,
    };
    learningItemId = await repoCreateLearningItem(tx, { languageId, levelId, position, lessonPriority: position, type: "vocabulary", fields: vocabularyFields });
    result.createdVocabularyItemIds.push(learningItemId);
    await recordAuditEvent(tx, { actorUserId, action: "CURRICULUM_ITEM_CREATED", resourceType: "vocabulary_item", resourceId: learningItemId, afterData: vocabularyFields, correlationId });
  } else {
    const grammarFields: GrammarFieldsInput = {
      title: fields.title,
      structure: fields.structure,
      primaryMeaning: fields.primaryMeaning,
      explanation: fields.explanation,
      category: fields.category,
      creatorNotes: fields.creatorNotes,
      requiredQuestions: fields.requiredQuestions,
      acceptedAnswers: fields.acceptedAnswers,
    };
    learningItemId = await repoCreateLearningItem(tx, { languageId, levelId, position, lessonPriority: position, type: "grammar", fields: grammarFields });
    result.createdGrammarItemIds.push(learningItemId);
    await recordAuditEvent(tx, { actorUserId, action: "CURRICULUM_ITEM_CREATED", resourceType: "grammar_item", resourceId: learningItemId, afterData: grammarFields, correlationId });
  }

  // Registered so a *later row of this same file* naming the same word
  // updates what this row just created, instead of creating it twice. The
  // lookups were loaded once before the loop, and without this a repeated
  // term would silently produce two items.
  const matches = lookups.targetsByType[fields.itemType];
  const normalizedTerm = normalizeForComparison(displayFormOf(fields));
  matches.set(normalizedTerm, [
    ...(matches.get(normalizedTerm) ?? []),
    {
      learningItemId,
      normalizedTerm,
      status: "pending",
      levelId,
      levelNumber: fields.levelNumber,
      version: 1,
      vocabularyGroupId: groupId,
      groupNumber: fields.itemType === "vocabulary" ? fields.groupNumber : null,
      dictionaryFieldOverrides: [],
      current: importedValues(fields),
    },
  ]);
}

/**
 * Updates an item that already exists, keeping its permanent ID so learner
 * progress, SRS state, review history and deck membership all survive
 * (spec 17, and `architecture.md`'s Permanent Identity).
 *
 * A published item's *content* change lands in its draft, for an Admin to
 * publish — the same rule `updateItem` follows. A **move** is applied
 * directly even then, because placement is structural rather than editable
 * content: a draft has nowhere to put it, and that is exactly how the
 * existing `moveItem` path already treats a published item.
 */
async function applyImportUpdate(tx: DbClient, { resolved, target, actorUserId, correlationId, result }: ApplyContext & { target: ImportMatchTarget }): Promise<void> {
  const { fields, levelId, groupId, placement, changes, savesAsDraft } = resolved;
  const learningItemId = target.learningItemId;
  const changed = Object.fromEntries(changes.map((change) => [change.field, change.to]));

  if (placement) {
    await moveLearningItem(tx, {
      learningItemId,
      type: fields.itemType,
      ...(placement.fromLevelNumber !== placement.toLevelNumber ? { levelId } : {}),
      ...(groupId && target.vocabularyGroupId !== groupId ? { vocabularyGroupId: groupId } : {}),
    });
    result.movedItemIds.push(learningItemId);
    await recordAuditEvent(tx, {
      actorUserId,
      action: "CURRICULUM_ITEM_MOVED",
      resourceType: itemResourceType(fields.itemType),
      resourceId: learningItemId,
      beforeData: { levelNumber: placement.fromLevelNumber, groupNumber: placement.fromGroupNumber },
      afterData: { levelNumber: placement.toLevelNumber, groupNumber: placement.toGroupNumber },
      correlationId,
    });
  }

  if (changes.length === 0) return;

  if (savesAsDraft) {
    const acceptedAnswers = await getAcceptedAnswers(tx, learningItemId);
    const data =
      fields.itemType === "vocabulary"
        ? {
            type: "vocabulary" as const,
            fields: {
              vocabularyGroupId: groupId ?? target.vocabularyGroupId!,
              term: fields.term,
              primaryMeaning: (changed.primaryMeaning as string) ?? target.current.primaryMeaning!,
              definition: (changed.definition as string) ?? target.current.definition,
              article: (changed.article as string) ?? target.current.article,
              partOfSpeech: (changed.partOfSpeech as string) ?? target.current.partOfSpeech!,
              pronunciation: (changed.pronunciation as string) ?? target.current.pronunciation,
              ipa: (changed.ipa as string) ?? target.current.ipa,
              context: (changed.context as string) ?? target.current.context,
              creatorNotes: (changed.creatorNotes as string) ?? target.current.creatorNotes,
              acceptedAnswers: acceptedAnswers.map((answer) => ({ side: answer.side, value: answer.value })),
            },
          }
        : {
            type: "grammar" as const,
            fields: {
              title: (changed.title as string) ?? target.current.title,
              structure: fields.structure,
              primaryMeaning: (changed.primaryMeaning as string) ?? target.current.primaryMeaning!,
              explanation: (changed.explanation as string) ?? target.current.explanation!,
              category: (changed.category as string) ?? target.current.category,
              creatorNotes: (changed.creatorNotes as string) ?? target.current.creatorNotes,
              requiredQuestions: fields.requiredQuestions,
              acceptedAnswers: acceptedAnswers.map((answer) => ({ side: answer.side, value: answer.value })),
            },
          };
    await repoSaveDraft(tx, { learningItemId, baseVersion: target.version, createdBy: actorUserId, data });
    result.draftedItemIds.push(learningItemId);
  } else if (fields.itemType === "vocabulary") {
    await updateVocabularyFieldsFromImport(tx, learningItemId, changed);
  } else {
    await updateGrammarFieldsFromImport(tx, learningItemId, changed);
  }

  if (fields.itemType === "vocabulary") result.updatedVocabularyItemIds.push(learningItemId);
  else result.updatedGrammarItemIds.push(learningItemId);

  await recordAuditEvent(tx, {
    actorUserId,
    action: "CURRICULUM_ITEM_UPDATED",
    resourceType: itemResourceType(fields.itemType),
    resourceId: learningItemId,
    beforeData: Object.fromEntries(changes.map((change) => [change.field, change.from])),
    afterData: { ...changed, source: "import", savedAsDraft: savesAsDraft },
    correlationId,
  });
}
