import type { VocabularyFieldsInput } from "./curriculum-mutation-types";

/**
 * Spec 13's "Curriculum Authoring at Volume" — column contract and per-row
 * shape validation for a bulk vocabulary CSV/TSV upload. Pure and
 * database-free, and deliberately free of `csv-parse` too (that lives in
 * `./vocabulary-import-file-parser.ts` instead) — this file's constants and
 * types are safe for a client component to import (the upload UI shows the
 * expected columns), which a Node-oriented parsing library isn't worth
 * risking in a client bundle for.
 *
 * Column headers are matched case/whitespace-insensitively (`term`, `Term`,
 * and `Term ` all resolve the same field) since spreadsheet exports vary,
 * but the column *set* itself is fixed — spec 13 doesn't ask for a
 * column-mapping UI, and building one would be real, unrequested scope.
 */

export const REQUIRED_IMPORT_COLUMNS = ["term", "primary_meaning", "part_of_speech"] as const;
const OPTIONAL_IMPORT_COLUMNS = ["article", "definition", "pronunciation", "ipa", "context", "creator_notes"] as const;
export const IMPORT_COLUMNS = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS] as const;
type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** A file large enough to need this feature is still a hand-authored spreadsheet, not a data pipe — bounded generously, not unbounded. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

export type ImportDelimiter = "," | "\t";
export type RawVocabularyImportRow = Record<string, string>;
export type ImportFileParseError = { type: "unparseable"; message: string } | { type: "missing_columns"; columns: string[] } | { type: "too_many_rows"; count: number };
export type ImportFileParseResult = { ok: true; rows: RawVocabularyImportRow[] } | { ok: false; error: ImportFileParseError };

export type ImportRowFieldIssue = { field: ImportColumn; message: string };

/**
 * Everything a row contributes except `vocabularyGroupId` — the whole
 * import targets one admin-chosen group (spec 13: "Level, group... remain
 * controlled by Admin," not read from the file), so it's added once by
 * `domains/admin/bulk-import-service.ts` when building the real
 * `VocabularyFieldsInput`, not carried per row.
 */
export type ParsedVocabularyFields = Omit<VocabularyFieldsInput, "vocabularyGroupId">;

export type ValidatedImportRow = {
  rowNumber: number;
  raw: RawVocabularyImportRow;
  /** `null` when a required field is missing/blank — nothing else about this row (duplicates included) is worth checking until that's fixed in the source file. */
  fields: ParsedVocabularyFields | null;
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

  const term = emptyToUndefined(raw.term);
  const primaryMeaning = emptyToUndefined(raw.primary_meaning);
  const partOfSpeech = emptyToUndefined(raw.part_of_speech);

  if (!term) fieldIssues.push({ field: "term", message: "Missing term." });
  if (!primaryMeaning) fieldIssues.push({ field: "primary_meaning", message: "Missing primary meaning." });
  if (!partOfSpeech) fieldIssues.push({ field: "part_of_speech", message: "Missing part of speech." });

  if (!term || !primaryMeaning || !partOfSpeech) {
    return { rowNumber, raw, fields: null, fieldIssues };
  }

  const fields: ParsedVocabularyFields = {
    term,
    primaryMeaning,
    partOfSpeech,
    article: emptyToUndefined(raw.article) ?? null,
    definition: emptyToUndefined(raw.definition) ?? null,
    pronunciation: emptyToUndefined(raw.pronunciation) ?? null,
    ipa: emptyToUndefined(raw.ipa) ?? null,
    context: emptyToUndefined(raw.context) ?? null,
    creatorNotes: emptyToUndefined(raw.creator_notes) ?? null,
    acceptedAnswers: [],
  };

  return { rowNumber, raw, fields, fieldIssues };
}
