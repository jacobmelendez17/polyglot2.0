import { parse } from "csv-parse/sync";

import { IMPORT_COLUMN_ALIASES, MAX_IMPORT_ROWS, REQUIRED_IMPORT_COLUMNS } from "./vocabulary-import-parsing";
import type { ImportDelimiter, ImportFileParseResult, RawVocabularyImportRow } from "./vocabulary-import-parsing";

/**
 * The one function in this feature that actually touches `csv-parse` — kept
 * out of `vocabulary-import-parsing.ts` (and so out of `domains/curriculum/index.ts`,
 * the client-safe barrel) so a Node-oriented CSV library is never a
 * candidate for the browser bundle. Import this only from server-only code
 * (a Server Action, `domains/admin/bulk-import-service.ts`, or a test).
 */

/**
 * Case/whitespace-insensitive first, then a canonical-name lookup, so
 * `Batch ID`, `batch_id`, and `group` all resolve to the same field. The
 * alias table lives in `vocabulary-import-parsing.ts` because the upload UI
 * needs to be able to describe it without importing `csv-parse`.
 */
function normalizeHeader(header: string): string {
  const normalized = header.trim().toLowerCase().replace(/\s+/g, "_");
  return IMPORT_COLUMN_ALIASES[normalized] ?? normalized;
}

/**
 * Parses raw file text into normalized-header rows. Never throws on
 * malformed CSV — `csv-parse` errors are converted into a result the caller
 * can render, matching this codebase's "the boundary validates, it doesn't
 * crash" convention.
 */
export function parseVocabularyImportFile(content: string, delimiter: ImportDelimiter): ImportFileParseResult {
  let records: RawVocabularyImportRow[];
  try {
    records = parse(content, {
      columns: (headerRow: string[]) => headerRow.map(normalizeHeader),
      delimiter,
      // A spreadsheet export (including the authored Level 1 curriculum
      // file) is routinely UTF-8 *with* a byte-order mark. Without this the
      // BOM stays glued to the first header, which reads as `word` missing
      // — a genuinely baffling error message for a file whose first column
      // is plainly `word`.
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as RawVocabularyImportRow[];
  } catch (error) {
    return { ok: false, error: { type: "unparseable", message: error instanceof Error ? error.message : "Could not parse this file." } };
  }

  if (records.length === 0) {
    return { ok: false, error: { type: "unparseable", message: "The file has no data rows." } };
  }

  if (records.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: { type: "too_many_rows", count: records.length } };
  }

  const presentColumns = new Set(Object.keys(records[0]!));
  const missingRequired = REQUIRED_IMPORT_COLUMNS.filter((column) => !presentColumns.has(column));
  if (missingRequired.length > 0) {
    return { ok: false, error: { type: "missing_columns", columns: missingRequired } };
  }

  return { ok: true, rows: records };
}
