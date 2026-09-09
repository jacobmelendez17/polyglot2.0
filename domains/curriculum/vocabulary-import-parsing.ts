import type { GrammarFieldsInput, VocabularyFieldsInput } from "./curriculum-mutation-types";

/**
 * Column contract and per-row shape validation for a bulk curriculum
 * CSV/TSV upload. Pure and database-free, and deliberately free of
 * `csv-parse` too (that lives in `./vocabulary-import-file-parser.ts`
 * instead) — this file's constants and types are safe for a client
 * component to import (the upload UI shows the expected columns), which a
 * Node-oriented parsing library isn't worth risking in a client bundle for.
 *
 * Column headers are matched case/whitespace-insensitively (`word`,
 * `Word`, and `Word ` all resolve the same field) since spreadsheet exports
 * vary, and a short fixed list of synonyms is accepted for the group column
 * (`IMPORT_COLUMN_ALIASES` below). The column *set* itself is still fixed —
 * there's no column-mapping UI, and building one would be unrequested
 * scope.
 *
 * 2026-09-08 rewrite ("make importing easier"): only `word`, `translation`,
 * `level`, and `group` are required — `part_of_speech` moved from required
 * to optional, and level/group are no longer chosen once for the whole
 * file via a picker; every row now carries its own. `level` is the plain
 * level number (matching how an admin already thinks of "Level 3", not a
 * UUID); `group` is the group's position *within that level* — every
 * level's own vocabulary groups are numbered 1, 2, 3… by
 * `vocabulary_groups.position`, and this reuses that number directly
 * rather than inventing a second numbering scheme. `GRAMMAR_GROUP_NUMBER`
 * is a deliberate sentinel: grammar items have no group at all in the
 * schema, so one out-of-range group number (one past the realistic
 * vocabulary-group count) doubles as "this row is grammar, not
 * vocabulary" — see `MAX_VOCABULARY_GROUP_NUMBER`'s value, chosen to match
 * `CURRICULUM_VALIDATION_CONFIG`'s own default of 4 groups per level.
 */

export const REQUIRED_IMPORT_COLUMNS = ["word", "translation", "level", "group"] as const;
const OPTIONAL_IMPORT_COLUMNS = ["part_of_speech", "article", "definition", "pronunciation", "ipa", "context", "creator_notes"] as const;
export const IMPORT_COLUMNS = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS] as const;
type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/**
 * Accepted spellings of a canonical column header, applied after the
 * case/whitespace normalization above (spec 16, 2026-09-08). The authored
 * Level 1 curriculum file names its group column `batch_id` — the same
 * concept under the word the curriculum author already uses for it — so
 * rejecting the file would mean hand-editing a header on every future
 * authored level rather than accepting a synonym once.
 *
 * Deliberately narrow: only the group column has a real competing name in
 * the files this project actually authors. This is not a general
 * column-mapping layer, and it must never map two different source columns
 * onto the same canonical one in a single file — the last header simply
 * wins, exactly as a literal duplicate header already would.
 */
export const IMPORT_COLUMN_ALIASES: Readonly<Record<string, ImportColumn>> = {
  batch: "group",
  batch_id: "group",
  group_id: "group",
  group_number: "group",
};

/** A level's vocabulary groups are numbered 1..4 by position (the codebase's own default group count per level). */
export const MAX_VOCABULARY_GROUP_NUMBER = 4;
/** One past the last real vocabulary group number — a row with this group value has no group at all; it's a grammar item. */
export const GRAMMAR_GROUP_NUMBER = MAX_VOCABULARY_GROUP_NUMBER + 1;

/** A file large enough to need this feature is still a hand-authored spreadsheet, not a data pipe — bounded generously, not unbounded. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

export type ImportDelimiter = "," | "\t";
export type RawVocabularyImportRow = Record<string, string>;
export type ImportFileParseError = { type: "unparseable"; message: string } | { type: "missing_columns"; columns: string[] } | { type: "too_many_rows"; count: number };
export type ImportFileParseResult = { ok: true; rows: RawVocabularyImportRow[] } | { ok: false; error: ImportFileParseError };

export type ImportRowFieldIssue = { field: ImportColumn; message: string };

/**
 * Everything a vocabulary row contributes except `vocabularyGroupId` — the
 * actual group id can only be resolved against the database (this file
 * stays pure), so `levelNumber`/`groupNumber` travel instead, and
 * `domains/admin/bulk-import-service.ts` resolves them into a real
 * `vocabularyGroupId` once it knows the target language.
 */
export type ParsedVocabularyFields = Omit<VocabularyFieldsInput, "vocabularyGroupId"> & {
  itemType: "vocabulary";
  levelNumber: number;
  groupNumber: number;
};

/** Grammar has no group at all — only `levelNumber` needs later resolution. */
export type ParsedGrammarFields = GrammarFieldsInput & {
  itemType: "grammar";
  levelNumber: number;
};

export type ParsedImportFields = ParsedVocabularyFields | ParsedGrammarFields;

export type ValidatedImportRow = {
  rowNumber: number;
  raw: RawVocabularyImportRow;
  /** `null` when a required field is missing/blank/malformed — nothing else about this row (duplicates included) is worth checking until that's fixed in the source file. */
  fields: ParsedImportFields | null;
  fieldIssues: ImportRowFieldIssue[];
};

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Row 1-indexed and offset by 1 to account for the header row, so
 * `rowNumber` matches what a spreadsheet editor would call it — the number
 * an admin actually sees when they go fix row 14 in their own file.
 */
export function validateVocabularyImportRow(raw: RawVocabularyImportRow, index: number): ValidatedImportRow {
  const rowNumber = index + 2;
  const fieldIssues: ImportRowFieldIssue[] = [];

  const word = emptyToUndefined(raw.word);
  const translation = emptyToUndefined(raw.translation);
  const levelRaw = emptyToUndefined(raw.level);
  const groupRaw = emptyToUndefined(raw.group);

  if (!word) fieldIssues.push({ field: "word", message: "Missing word." });
  if (!translation) fieldIssues.push({ field: "translation", message: "Missing translation." });

  let levelNumber = NaN;
  if (!levelRaw) {
    fieldIssues.push({ field: "level", message: "Missing level." });
  } else {
    levelNumber = Number(levelRaw);
    if (!Number.isInteger(levelNumber) || levelNumber < 1) {
      fieldIssues.push({ field: "level", message: `"${levelRaw}" isn't a valid level number.` });
    }
  }

  let groupNumber = NaN;
  if (!groupRaw) {
    fieldIssues.push({ field: "group", message: "Missing group." });
  } else {
    groupNumber = Number(groupRaw);
    if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > GRAMMAR_GROUP_NUMBER) {
      fieldIssues.push({ field: "group", message: `Group must be 1-${MAX_VOCABULARY_GROUP_NUMBER} (vocabulary) or ${GRAMMAR_GROUP_NUMBER} (grammar).` });
    }
  }

  if (fieldIssues.length > 0) {
    return { rowNumber, raw, fields: null, fieldIssues };
  }

  // `word`/`translation` are guaranteed defined here — any missing/blank
  // value already returned above via `fieldIssues.length > 0`.
  const definiteWord = word!;
  const definiteTranslation = translation!;

  if (groupNumber === GRAMMAR_GROUP_NUMBER) {
    const fields: ParsedGrammarFields = {
      itemType: "grammar",
      levelNumber,
      title: null,
      structure: definiteWord,
      primaryMeaning: definiteTranslation,
      // Left blank on purpose — the real teaching explanation is written
      // afterward in Admin, not guessed from a two-column spreadsheet row.
      explanation: "",
      category: null,
      creatorNotes: emptyToUndefined(raw.creator_notes) ?? null,
      requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
      acceptedAnswers: [],
    };
    return { rowNumber, raw, fields, fieldIssues: [] };
  }

  const fields: ParsedVocabularyFields = {
    itemType: "vocabulary",
    levelNumber,
    groupNumber,
    term: definiteWord,
    primaryMeaning: definiteTranslation,
    partOfSpeech: emptyToUndefined(raw.part_of_speech) ?? "",
    article: emptyToUndefined(raw.article) ?? null,
    definition: emptyToUndefined(raw.definition) ?? null,
    pronunciation: emptyToUndefined(raw.pronunciation) ?? null,
    ipa: emptyToUndefined(raw.ipa) ?? null,
    context: emptyToUndefined(raw.context) ?? null,
    creatorNotes: emptyToUndefined(raw.creator_notes) ?? null,
    acceptedAnswers: [],
  };

  return { rowNumber, raw, fields, fieldIssues: [] };
}
