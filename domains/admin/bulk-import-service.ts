import type { DbClient } from "@/db/client";
import { findDuplicateCandidates } from "@/domains/curriculum/curriculum-duplicate-detection";
import {
  createLearningItem as repoCreateLearningItem,
  createLevel as repoCreateLevel,
  createVocabularyGroup as repoCreateVocabularyGroup,
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
import {
  getLanguageById,
  getLevelsByLanguage,
  getVocabularyGroupsByLanguage,
} from "@/domains/curriculum/curriculum-repository";
import type {
  DuplicateCandidate,
  GrammarFieldsInput,
  VocabularyFieldsInput,
} from "@/domains/curriculum/curriculum-mutation-types";
import type {
  ImportRowFieldIssue,
  ParsedImportFields,
  ValidatedImportRow,
} from "@/domains/curriculum/vocabulary-import-parsing";
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
export type ImportRowAction =
  "create" | "update" | "move" | "unchanged" | "blocked";

export type ImportFieldChange = {
  field: string;
  from: string | null;
  to: string | null;
};

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
  /** Spec 25 §9 — set when this row's Level doesn't exist yet and would be created alongside it. `null` when the Level already exists (or the row couldn't be resolved at all). */
  levelToCreate: { levelNumber: number; name: string } | null;
  /** Spec 25 §9 — set when this row's vocabulary group doesn't exist yet and would be created alongside it. Always `null` for grammar (grammar has no group). */
  groupToCreate: { groupNumber: number; name: string } | null;
};

type LevelLookupEntry = { id: string; name: string | null };
type GroupLookupEntry = { id: string; name: string };

/** `level 1` -> that level's real id+name, and `(levelId, position)` -> that group's real id+name — both batched once per import, never per row. Mutated in place as `materializeStructure` creates new Levels/groups mid-commit (spec 25 §9), so a later row in the same file sees them without a fresh query. */
async function loadLevelAndGroupLookups(db: DbClient, languageId: string) {
  const [levelsForLanguage, groupsForLanguage] = await Promise.all([
    getLevelsByLanguage(db, languageId),
    getVocabularyGroupsByLanguage(db, languageId),
  ]);
  const levelByNumber = new Map<number, LevelLookupEntry>(
    levelsForLanguage.map((level) => [
      level.levelNumber,
      { id: level.id, name: level.name },
    ]),
  );
  const groupByLevelAndPosition = new Map<string, GroupLookupEntry>(
    groupsForLanguage.map((group) => [
      `${group.levelId}:${group.position}`,
      { id: group.id, name: group.name },
    ]),
  );
  return { levelByNumber, groupByLevelAndPosition };
}

/** The term/structure a row's duplicate-detection and display revolve around, regardless of item type. */
function displayFormOf(fields: ParsedImportFields): string {
  return fields.itemType === "vocabulary" ? fields.term : fields.structure;
}

function itemResourceType(itemType: "vocabulary" | "grammar"): string {
  return itemType === "vocabulary" ? "vocabulary_item" : "grammar_item";
}

/**
 * The fields an import row can carry for each item type, in the order a
 * preview lists them. `term`/`structure` (spec 25 Unit 4) are the item's own
 * display form — diffable/renameable like any other field now that
 * `curriculum_key` can be the match instead of spelling (see
 * `resolveImportRow`); a spelling-matched row could never usefully propose
 * changing the very spelling it matched on, so this is new precisely
 * because key-based matching is.
 */
const IMPORTABLE_FIELDS = {
  vocabulary: [
    "term",
    "primaryMeaning",
    "definition",
    "article",
    "partOfSpeech",
    "pronunciation",
    "ipa",
    "context",
    "creatorNotes",
  ],
  grammar: [
    "structure",
    "primaryMeaning",
    "title",
    "explanation",
    "category",
    "creatorNotes",
  ],
} as const;

/**
 * What one row of the file carries, as plain values — `undefined` for a
 * field the file says nothing about (an absent column, a blank cell, or
 * `N/A`), `null` for a field the file explicitly clears (spec 25 §7.4's
 * `__CLEAR__`), or the real string otherwise. `resolveImportRow`'s diff
 * reads this distinction directly: `undefined` proposes no change at all,
 * `null` proposes clearing.
 *
 * `partOfSpeech`/`title`/`category`/`explanation` are not clearable (no
 * `__CLEAR__` support was added for them in `vocabulary-import-parsing.ts` —
 * see that file's docstring for why), so their own "nothing supplied" value
 * (`""` from the parser) is mapped to `undefined` here rather than `null`,
 * to make sure it is never misread as a clear request.
 */
function importedValues(
  fields: ParsedImportFields,
): Record<string, string | null | undefined> {
  if (fields.itemType === "vocabulary") {
    return {
      term: fields.term,
      primaryMeaning: fields.primaryMeaning,
      definition: fields.definition,
      article: fields.article,
      partOfSpeech: fields.partOfSpeech || undefined,
      pronunciation: fields.pronunciation,
      ipa: fields.ipa,
      context: fields.context,
      creatorNotes: fields.creatorNotes,
    };
  }
  return {
    structure: fields.structure,
    primaryMeaning: fields.primaryMeaning,
    title: fields.title ?? undefined,
    explanation: fields.explanation || undefined,
    category: fields.category ?? undefined,
    creatorNotes: fields.creatorNotes,
  };
}

/**
 * Picks the value a published item's draft should carry for one field: the
 * newly resolved value when `changes` actually proposed one for it
 * (including an explicit spec 25 §7.4 clear, `null`), otherwise the item's
 * own current value, unchanged. Deliberately checks *presence* in `changed`
 * (`field in changed`), not truthiness or `?? currentValue` — the latter
 * would silently discard an explicit clear, since `null ?? currentValue`
 * evaluates to `currentValue`, not `null`.
 */
function resolvedValue(
  changed: Record<string, string | null>,
  field: string,
  currentValue: string | null,
): string | null {
  return field in changed ? changed[field] : currentValue;
}

/**
 * Spec 25 §9 — a row's target Level, resolved three ways: it already exists
 * (`existing`), it doesn't and this row supplies enough to create it
 * (`toCreate`), or it exists under a *different* name than this row
 * supplies (`nameConflict` — §9.1's "never silently rename"). A blank/absent
 * `level_name` on a row targeting an existing Level is never a conflict —
 * it simply means "don't redefine the name" (spec §5.2).
 */
type ResolvedLevel =
  | { kind: "existing"; id: string }
  | { kind: "toCreate"; levelNumber: number; name: string }
  | {
      kind: "nameConflict";
      id: string;
      existingName: string | null;
      suppliedName: string;
    };

/** Same three-way shape as `ResolvedLevel`, plus `none` for a grammar row (grammar has no group at all). */
type ResolvedGroup =
  | { kind: "none" }
  | { kind: "existing"; id: string }
  | { kind: "toCreate"; groupNumber: number; name: string }
  | {
      kind: "nameConflict";
      id: string;
      existingName: string;
      suppliedName: string;
    };

type ResolvedImportRow =
  | { kind: "invalid"; fieldIssues: ImportRowFieldIssue[] }
  | {
      kind: "resolved";
      fields: ParsedImportFields;
      level: ResolvedLevel;
      group: ResolvedGroup;
      target: ImportMatchTarget | null;
      action: ImportRowAction;
      blockedReason: string | null;
      changes: ImportFieldChange[];
      placement: ImportRowPlacementChange | null;
      savesAsDraft: boolean;
    };

type ImportLookups = {
  levelByNumber: Map<number, LevelLookupEntry>;
  groupByLevelAndPosition: Map<string, GroupLookupEntry>;
  /**
   * Every item sharing a term, not just one — a term can legitimately belong
   * to several rows: an archived item the curriculum has moved past, or two
   * approved homonyms.
   */
  targetsByType: {
    vocabulary: Map<string, ImportMatchTarget[]>;
    grammar: Map<string, ImportMatchTarget[]>;
  };
  /**
   * Spec 25 Unit 4 — curriculum_key -> target, per item type. A curriculum
   * key is globally unique in the database (spec 25 Unit 1's constraint), so
   * unlike `targetsByType` this never needs to hold more than one match; kept
   * scoped per type anyway (mirroring `targetsByType`'s shape) so a key that
   * belongs to the *other* item type simply reports as unmatched for this
   * one, rather than needing its own cross-type special case.
   */
  targetsByKey: {
    vocabulary: Map<string, ImportMatchTarget>;
    grammar: Map<string, ImportMatchTarget>;
  };
  /**
   * Spec 25 Unit 2's optional `language` column — validated here rather than
   * in `vocabulary-import-parsing.ts` (which stays database-free) since only
   * the resolver actually knows which language this import targets. Catches
   * the wrong-file-for-this-language mistake; it is not a mechanism for one
   * file spanning several languages (the admin still picks one language for
   * the whole import, per the upload screen).
   */
  expectedLanguageCode: string;
};

/**
 * Resolves a row's target Level against `lookups.levelByNumber` (spec 25
 * §9). Returns an `ImportRowFieldIssue` directly (rather than a `ResolvedLevel`)
 * only when the Level doesn't exist and nothing was supplied to create it —
 * every other case, including a name conflict, is a `ResolvedLevel` the
 * caller decides what to do with.
 */
function resolveLevelStructure(
  levelNumber: number,
  suppliedName: string | null,
  lookups: ImportLookups,
): ResolvedLevel | ImportRowFieldIssue {
  const existing = lookups.levelByNumber.get(levelNumber);
  if (!existing) {
    if (!suppliedName) {
      return {
        field: "level",
        message: `Level ${levelNumber} doesn't exist yet. Provide level_name to create it.`,
      };
    }
    return { kind: "toCreate", levelNumber, name: suppliedName };
  }
  if (suppliedName && existing.name && suppliedName !== existing.name) {
    return {
      kind: "nameConflict",
      id: existing.id,
      existingName: existing.name,
      suppliedName,
    };
  }
  return { kind: "existing", id: existing.id };
}

/**
 * Resolves a vocabulary row's target group against `lookups.groupByLevelAndPosition`
 * — `levelId` is `null` when the Level itself is still only `toCreate`, in
 * which case the group can't possibly exist yet either. Same three-way
 * shape and same field-issue-vs-resolved split as `resolveLevelStructure`.
 */
function resolveGroupStructure(
  levelId: string | null,
  levelNumber: number,
  groupNumber: number,
  suppliedName: string | null,
  lookups: ImportLookups,
): ResolvedGroup | ImportRowFieldIssue {
  const existing = levelId
    ? lookups.groupByLevelAndPosition.get(`${levelId}:${groupNumber}`)
    : undefined;
  if (!existing) {
    if (!suppliedName) {
      return {
        field: "group",
        message: `Level ${levelNumber} has no group ${groupNumber} yet. Provide batch_name to create it.`,
      };
    }
    return { kind: "toCreate", groupNumber, name: suppliedName };
  }
  if (suppliedName && suppliedName !== existing.name) {
    return {
      kind: "nameConflict",
      id: existing.id,
      existingName: existing.name,
      suppliedName,
    };
  }
  return { kind: "existing", id: existing.id };
}

function isFieldIssue(
  value: ResolvedLevel | ResolvedGroup | ImportRowFieldIssue,
): value is ImportRowFieldIssue {
  return "field" in value;
}

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
function chooseMatchTarget(matches: ImportMatchTarget[]): {
  target: ImportMatchTarget | null;
  blockedReason: string | null;
} {
  if (matches.length === 0) return { target: null, blockedReason: null };

  const live = matches.filter((match) => match.status !== "archived");
  if (live.length === 1) return { target: live[0]!, blockedReason: null };
  if (live.length > 1) {
    return {
      target: null,
      blockedReason: `This word exists ${live.length} times in the curriculum, so a file cannot say which one to update. Edit them in Admin instead.`,
    };
  }
  return {
    target: null,
    blockedReason:
      "This word is archived. Restore it in Admin before re-importing it.",
  };
}

/**
 * Decides what one row does — the single place that answer is computed
 * (spec 17). The preview reports it and the commit applies it, so the two
 * can never disagree about what an admin approved; the commit still calls
 * this itself against freshly loaded data rather than trusting a preview
 * response from an earlier request.
 */
function resolveImportRow(
  row: ValidatedImportRow,
  lookups: ImportLookups,
): ResolvedImportRow {
  if (!row.fields) return { kind: "invalid", fieldIssues: row.fieldIssues };

  const rowLanguage = row.raw.language?.trim();
  if (
    rowLanguage &&
    rowLanguage.toLowerCase() !== lookups.expectedLanguageCode.toLowerCase()
  ) {
    return {
      kind: "invalid",
      fieldIssues: [
        {
          field: "language",
          message: `This row is for "${rowLanguage}", but this import is for "${lookups.expectedLanguageCode}".`,
        },
      ],
    };
  }

  const levelResult = resolveLevelStructure(
    row.fields.levelNumber,
    row.fields.levelName,
    lookups,
  );
  if (isFieldIssue(levelResult)) {
    return { kind: "invalid", fieldIssues: [levelResult] };
  }
  const level = levelResult;

  let group: ResolvedGroup = { kind: "none" };
  if (row.fields.itemType === "vocabulary") {
    const levelIdForGroupLookup = level.kind === "toCreate" ? null : level.id;
    const groupResult = resolveGroupStructure(
      levelIdForGroupLookup,
      row.fields.levelNumber,
      row.fields.groupNumber,
      row.fields.groupName,
      lookups,
    );
    if (isFieldIssue(groupResult)) {
      return { kind: "invalid", fieldIssues: [groupResult] };
    }
    group = groupResult;
  }

  // Spec 25 Unit 4 — a supplied curriculum_key is the *primary* match: it
  // identifies one specific item regardless of spelling, so a row can
  // rename the very word it matches on (see `IMPORTABLE_FIELDS`'s `term`/
  // `structure`). A key that matches nothing is never silently treated as
  // "must be new" — the admin likely meant an existing item and something
  // is wrong (a typo, the wrong environment), so it blocks instead. Only
  // when no key is supplied at all does matching fall back to spelling,
  // exactly as every pre-Unit-4 file already relies on.
  let target: ImportMatchTarget | null;
  let matchBlockedReason: string | null;
  if (row.fields.curriculumKey) {
    const keyMatch = lookups.targetsByKey[row.fields.itemType].get(
      row.fields.curriculumKey,
    );
    if (!keyMatch) {
      return {
        kind: "invalid",
        fieldIssues: [
          {
            field: "curriculum_key",
            message: `No curriculum item has the key "${row.fields.curriculumKey}".`,
          },
        ],
      };
    }
    if (keyMatch.status === "archived") {
      target = null;
      matchBlockedReason =
        "This item is archived. Restore it in Admin before re-importing it.";
    } else {
      target = keyMatch;
      matchBlockedReason = null;
    }
  } else {
    const matches =
      lookups.targetsByType[row.fields.itemType].get(
        normalizeForComparison(displayFormOf(row.fields)),
      ) ?? [];
    ({ target, blockedReason: matchBlockedReason } =
      chooseMatchTarget(matches));
  }

  // Spec 25 §9.1 — an existing Level/group named differently than this row
  // says is a reviewable conflict, never a silent rename. Checked after
  // matching (not instead of it) so the row's *other* problems, if any,
  // still resolve normally — this conflict just wins if present.
  const structuralConflictReason =
    level.kind === "nameConflict"
      ? `Level ${row.fields.levelNumber} is named "${level.existingName ?? "(no name)"}" in the curriculum, but this file says "${level.suppliedName}". Correct one of them, or leave level_name blank to keep the existing name.`
      : group.kind === "nameConflict"
        ? `Batch ${row.fields.itemType === "vocabulary" ? row.fields.groupNumber : ""} in Level ${row.fields.levelNumber} is named "${group.existingName}" in the curriculum, but this file says "${group.suppliedName}". Correct one of them, or leave batch_name blank to keep the existing name.`
        : null;
  const blockedReason = matchBlockedReason ?? structuralConflictReason;

  const base = {
    kind: "resolved" as const,
    fields: row.fields,
    level,
    group,
    target,
  };

  if (blockedReason) {
    return {
      ...base,
      action: "blocked",
      blockedReason,
      changes: [],
      placement: null,
      savesAsDraft: false,
    };
  }

  if (!target) {
    return {
      ...base,
      action: "create",
      blockedReason: null,
      changes: [],
      placement: null,
      savesAsDraft: false,
    };
  }

  // A field an author has taken over is never rewritten by a file (spec 17),
  // exactly as it is never rewritten by the dictionary.
  const overridden = new Set<string>(target.dictionaryFieldOverrides);
  const values = importedValues(row.fields);
  const changes = IMPORTABLE_FIELDS[row.fields.itemType]
    .filter((field) => !overridden.has(field))
    .flatMap((field): ImportFieldChange[] => {
      const to = values[field];
      const from = target.current[field] ?? null;
      // `undefined` — the file said nothing about this field — never
      // proposes a change. `null` is spec 25 §7.4's explicit clear, and
      // *does* propose one when there's actually something to clear.
      if (to === undefined) return [];
      if (to === from) return [];
      return [{ field, from, to }];
    });

  const groupNumber =
    row.fields.itemType === "vocabulary" ? row.fields.groupNumber : null;
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

  const action: ImportRowAction = placement
    ? "move"
    : changes.length > 0
      ? "update"
      : "unchanged";
  return {
    ...base,
    action,
    blockedReason: null,
    changes,
    placement,
    savesAsDraft: target.status === "published",
  };
}

function groupByTerm(
  targets: ImportMatchTarget[],
): Map<string, ImportMatchTarget[]> {
  const byTerm = new Map<string, ImportMatchTarget[]>();
  for (const target of targets) {
    const existing = byTerm.get(target.normalizedTerm) ?? [];
    existing.push(target);
    byTerm.set(target.normalizedTerm, existing);
  }
  return byTerm;
}

/** Spec 25 Unit 4 — curriculum_key -> target. Unlike `groupByTerm`, never more than one target per key (the database's own unique constraint on `curriculum_key` guarantees it). */
function groupByKey(
  targets: ImportMatchTarget[],
): Map<string, ImportMatchTarget> {
  const byKey = new Map<string, ImportMatchTarget>();
  for (const target of targets) byKey.set(target.curriculumKey, target);
  return byKey;
}

async function loadImportLookups(
  db: DbClient,
  languageId: string,
): Promise<ImportLookups> {
  const [
    { levelByNumber, groupByLevelAndPosition },
    vocabularyTargets,
    grammarTargets,
    language,
  ] = await Promise.all([
    loadLevelAndGroupLookups(db, languageId),
    getImportMatchTargets(db, languageId, "vocabulary"),
    getImportMatchTargets(db, languageId, "grammar"),
    getLanguageById(db, languageId),
  ]);
  if (!language) {
    throw new AdminError(
      "CURRICULUM_VALIDATION_FAILED",
      "This import's language no longer exists.",
    );
  }
  return {
    levelByNumber,
    groupByLevelAndPosition,
    targetsByType: {
      vocabulary: groupByTerm(vocabularyTargets),
      grammar: groupByTerm(grammarTargets),
    },
    targetsByKey: {
      vocabulary: groupByKey(vocabularyTargets),
      grammar: groupByKey(grammarTargets),
    },
    expectedLanguageCode: language.code,
  };
}

export async function previewVocabularyImport(
  db: DbClient,
  {
    languageId,
    validatedRows,
  }: { languageId: string; validatedRows: ValidatedImportRow[] },
): Promise<ImportRowPreview[]> {
  const [candidateVocabRows, candidateGrammarRows, lookups] = await Promise.all(
    [
      getDuplicateCandidateRows(db, languageId, "vocabulary"),
      getDuplicateCandidateRows(db, languageId, "grammar"),
      loadImportLookups(db, languageId),
    ],
  );
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
      levelToCreate: null,
      groupToCreate: null,
    };

    const resolved = resolveImportRow(row, lookups);
    if (resolved.kind === "invalid") {
      return {
        ...empty,
        fields: null,
        fieldIssues: resolved.fieldIssues,
        action: "blocked",
      };
    }

    const displayForm = displayFormOf(resolved.fields);
    const key = `${resolved.fields.itemType}:${normalizeForComparison(displayForm)}`;
    const candidateRows =
      resolved.fields.itemType === "vocabulary"
        ? candidateVocabRows
        : candidateGrammarRows;
    // The item this row updates is not a duplicate of itself (spec 17):
    // an exact term match is now an update, so homonym approval is left for
    // genuinely different items.
    const existingDuplicates = findDuplicateCandidates(
      displayForm,
      candidateRows,
    ).filter(
      (candidate) =>
        candidate.learningItemId !== resolved.target?.learningItemId,
    );
    const duplicateOfEarlierRow = firstRowNumberByKey.get(key) ?? null;
    if (duplicateOfEarlierRow === null)
      firstRowNumberByKey.set(key, row.rowNumber);

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
      levelToCreate:
        resolved.level.kind === "toCreate"
          ? {
              levelNumber: resolved.level.levelNumber,
              name: resolved.level.name,
            }
          : null,
      groupToCreate:
        resolved.group.kind === "toCreate"
          ? {
              groupNumber: resolved.group.groupNumber,
              name: resolved.group.name,
            }
          : null,
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
export async function bulkImportVocabulary(
  db: DbClient,
  input: BulkImportVocabularyServiceInput,
): Promise<BulkImportVocabularyResult> {
  const importedRows = input.rows.filter((row) => row.decision === "import");
  if (importedRows.length === 0) {
    throw new AdminError(
      "CURRICULUM_VALIDATION_FAILED",
      "Nothing was selected to import.",
    );
  }

  return withIdempotency(
    db,
    {
      userId: input.actorUserId,
      operation: "admin.curriculum.bulk-import-vocabulary",
      key: input.idempotencyKey,
      payload: {
        languageId: input.languageId,
        rows: importedRows.map((row) => ({
          itemType: row.fields.itemType,
          levelNumber: row.fields.levelNumber,
          displayForm: displayFormOf(row.fields),
        })),
      },
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
        const resolved = resolveImportRow(
          { rowNumber: 0, raw: {}, fields: row.fields, fieldIssues: [] },
          lookups,
        );
        if (resolved.kind === "invalid") {
          throw new AdminError(
            "CURRICULUM_VALIDATION_FAILED",
            resolved.fieldIssues[0]?.message ??
              "This file no longer matches the curriculum.",
          );
        }

        const displayForm = displayFormOf(resolved.fields);

        if (resolved.action === "blocked") {
          result.blocked.push({
            displayForm,
            reason: resolved.blockedReason ?? "This row cannot be imported.",
          });
          continue;
        }

        if (resolved.action === "unchanged") {
          result.unchangedCount += 1;
          continue;
        }

        const { levelId, groupId } = await materializeStructure(
          tx,
          resolved,
          lookups,
          input.languageId,
          input.actorUserId,
          input.idempotencyKey,
        );

        if (resolved.target) {
          await applyImportUpdate(tx, {
            resolved,
            levelId,
            groupId,
            target: resolved.target,
            actorUserId: input.actorUserId,
            correlationId: input.idempotencyKey,
            result,
          });
          continue;
        }

        await applyImportCreate(tx, {
          resolved,
          levelId,
          groupId,
          languageId: input.languageId,
          actorUserId: input.actorUserId,
          correlationId: input.idempotencyKey,
          lookups,
          result,
        });
      }

      invalidateCurriculumCache(input.languageId);
      return result;
    },
  );
}

/**
 * Materializes whatever Level/vocabulary group a resolved row still needs
 * before its item can be written (spec 25 §9) — reusing anything already
 * created by an *earlier* row in this same commit via `lookups`' own maps,
 * which this function mutates in place so the next row sees it without a
 * fresh query.
 *
 * Never called for a row already classified `blocked` (see
 * `bulkImportVocabulary`'s loop) — a `nameConflict` reaching here would be a
 * real bug in `resolveImportRow`'s classification above, not a normal
 * outcome, so the thrown errors are defensive/internal, never user-facing.
 */
async function materializeStructure(
  tx: DbClient,
  resolved: Extract<ResolvedImportRow, { kind: "resolved" }>,
  lookups: ImportLookups,
  languageId: string,
  actorUserId: string,
  correlationId: string,
): Promise<{ levelId: string; groupId: string | null }> {
  let levelId: string;
  if (resolved.level.kind === "existing") {
    levelId = resolved.level.id;
  } else if (resolved.level.kind === "toCreate") {
    const { levelNumber, name } = resolved.level;
    const already = lookups.levelByNumber.get(levelNumber);
    if (already) {
      levelId = already.id;
    } else {
      levelId = await repoCreateLevel(tx, { languageId, levelNumber, name });
      await recordAuditEvent(tx, {
        actorUserId,
        action: "LEVEL_CREATED",
        resourceType: "level",
        resourceId: levelId,
        afterData: { languageId, levelNumber, name },
        correlationId,
      });
      lookups.levelByNumber.set(levelNumber, { id: levelId, name });
    }
  } else {
    throw new Error(
      `materializeStructure: unexpected level name conflict for Level ${resolved.fields.levelNumber} — this row should have been classified "blocked".`,
    );
  }

  if (resolved.group.kind === "none") return { levelId, groupId: null };
  if (resolved.group.kind === "existing") {
    return { levelId, groupId: resolved.group.id };
  }
  if (resolved.group.kind === "toCreate") {
    const { groupNumber, name } = resolved.group;
    const key = `${levelId}:${groupNumber}`;
    const already = lookups.groupByLevelAndPosition.get(key);
    if (already) return { levelId, groupId: already.id };
    const groupId = await repoCreateVocabularyGroup(tx, {
      levelId,
      languageId,
      name,
      position: groupNumber,
    });
    await recordAuditEvent(tx, {
      actorUserId,
      action: "GROUP_CREATED",
      resourceType: "vocabulary_group",
      resourceId: groupId,
      afterData: { levelId, groupNumber, name },
      correlationId,
    });
    lookups.groupByLevelAndPosition.set(key, { id: groupId, name });
    return { levelId, groupId };
  }
  throw new Error(
    `materializeStructure: unexpected group name conflict for a group in Level ${resolved.fields.levelNumber} — this row should have been classified "blocked".`,
  );
}

type ApplyContext = {
  resolved: Extract<ResolvedImportRow, { kind: "resolved" }>;
  levelId: string;
  groupId: string | null;
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
  {
    resolved,
    levelId,
    groupId,
    languageId,
    actorUserId,
    correlationId,
    lookups,
    result,
  }: ApplyContext & { languageId: string; lookups: ImportLookups },
): Promise<void> {
  const { fields } = resolved;
  const position = await getNextPosition(tx, levelId, fields.itemType);

  let learningItemId: string;
  if (fields.itemType === "vocabulary") {
    if (!groupId)
      throw new AdminError(
        "CURRICULUM_VALIDATION_FAILED",
        `Level ${fields.levelNumber} no longer has group ${fields.groupNumber}.`,
      );
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
    learningItemId = await repoCreateLearningItem(tx, {
      languageId,
      levelId,
      position,
      lessonPriority: position,
      type: "vocabulary",
      fields: vocabularyFields,
    });
    result.createdVocabularyItemIds.push(learningItemId);
    await recordAuditEvent(tx, {
      actorUserId,
      action: "CURRICULUM_ITEM_CREATED",
      resourceType: "vocabulary_item",
      resourceId: learningItemId,
      afterData: vocabularyFields,
      correlationId,
    });
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
    learningItemId = await repoCreateLearningItem(tx, {
      languageId,
      levelId,
      position,
      lessonPriority: position,
      type: "grammar",
      fields: grammarFields,
    });
    result.createdGrammarItemIds.push(learningItemId);
    await recordAuditEvent(tx, {
      actorUserId,
      action: "CURRICULUM_ITEM_CREATED",
      resourceType: "grammar_item",
      resourceId: learningItemId,
      afterData: grammarFields,
      correlationId,
    });
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
      // `ImportMatchTarget.current` doesn't carry `undefined` (a real DB row
      // never has it) — an "unsupplied" field on a row that just created a
      // fresh item simply has no value yet, which `null` already means here.
      current: Object.fromEntries(
        Object.entries(importedValues(fields)).map(([field, value]) => [
          field,
          value ?? null,
        ]),
      ),
      // A row reaching `applyImportCreate` never supplied a curriculum_key
      // (one that did either matched an existing item or was blocked as
      // "unknown" — see `resolveImportRow`), and the real key
      // `repoCreateLearningItem` just generated internally isn't returned
      // here to match against. `""` is a safe placeholder: no real parsed
      // `curriculumKey` is ever that value (blank parses to `null`), so a
      // later row in this same file can never spuriously key-match a
      // same-run create by accident.
      curriculumKey: "",
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
async function applyImportUpdate(
  tx: DbClient,
  {
    resolved,
    levelId,
    groupId,
    target,
    actorUserId,
    correlationId,
    result,
  }: ApplyContext & { target: ImportMatchTarget },
): Promise<void> {
  const { fields, placement, changes, savesAsDraft } = resolved;
  const learningItemId = target.learningItemId;
  const changed = Object.fromEntries(
    changes.map((change) => [change.field, change.to]),
  );

  if (placement) {
    await moveLearningItem(tx, {
      learningItemId,
      type: fields.itemType,
      ...(placement.fromLevelNumber !== placement.toLevelNumber
        ? { levelId }
        : {}),
      ...(groupId && target.vocabularyGroupId !== groupId
        ? { vocabularyGroupId: groupId }
        : {}),
    });
    result.movedItemIds.push(learningItemId);
    await recordAuditEvent(tx, {
      actorUserId,
      action: "CURRICULUM_ITEM_MOVED",
      resourceType: itemResourceType(fields.itemType),
      resourceId: learningItemId,
      beforeData: {
        levelNumber: placement.fromLevelNumber,
        groupNumber: placement.fromGroupNumber,
      },
      afterData: {
        levelNumber: placement.toLevelNumber,
        groupNumber: placement.toGroupNumber,
      },
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
              term: resolvedValue(changed, "term", target.current.term)!,
              primaryMeaning: resolvedValue(
                changed,
                "primaryMeaning",
                target.current.primaryMeaning,
              )!,
              definition: resolvedValue(
                changed,
                "definition",
                target.current.definition,
              ),
              article: resolvedValue(
                changed,
                "article",
                target.current.article,
              ),
              partOfSpeech: resolvedValue(
                changed,
                "partOfSpeech",
                target.current.partOfSpeech,
              )!,
              pronunciation: resolvedValue(
                changed,
                "pronunciation",
                target.current.pronunciation,
              ),
              ipa: resolvedValue(changed, "ipa", target.current.ipa),
              context: resolvedValue(
                changed,
                "context",
                target.current.context,
              ),
              creatorNotes: resolvedValue(
                changed,
                "creatorNotes",
                target.current.creatorNotes,
              ),
              acceptedAnswers: acceptedAnswers.map((answer) => ({
                side: answer.side,
                value: answer.value,
              })),
            },
          }
        : {
            type: "grammar" as const,
            fields: {
              title: resolvedValue(changed, "title", target.current.title),
              structure: resolvedValue(
                changed,
                "structure",
                target.current.structure,
              )!,
              primaryMeaning: resolvedValue(
                changed,
                "primaryMeaning",
                target.current.primaryMeaning,
              )!,
              explanation: resolvedValue(
                changed,
                "explanation",
                target.current.explanation,
              )!,
              category: resolvedValue(
                changed,
                "category",
                target.current.category,
              ),
              creatorNotes: resolvedValue(
                changed,
                "creatorNotes",
                target.current.creatorNotes,
              ),
              requiredQuestions: fields.requiredQuestions,
              acceptedAnswers: acceptedAnswers.map((answer) => ({
                side: answer.side,
                value: answer.value,
              })),
            },
          };
    await repoSaveDraft(tx, {
      learningItemId,
      baseVersion: target.version,
      createdBy: actorUserId,
      data,
    });
    result.draftedItemIds.push(learningItemId);
  } else if (fields.itemType === "vocabulary") {
    await updateVocabularyFieldsFromImport(tx, learningItemId, changed);
  } else {
    await updateGrammarFieldsFromImport(tx, learningItemId, changed);
  }

  if (fields.itemType === "vocabulary")
    result.updatedVocabularyItemIds.push(learningItemId);
  else result.updatedGrammarItemIds.push(learningItemId);

  await recordAuditEvent(tx, {
    actorUserId,
    action: "CURRICULUM_ITEM_UPDATED",
    resourceType: itemResourceType(fields.itemType),
    resourceId: learningItemId,
    beforeData: Object.fromEntries(
      changes.map((change) => [change.field, change.from]),
    ),
    afterData: { ...changed, source: "import", savedAsDraft: savesAsDraft },
    correlationId,
  });
}
