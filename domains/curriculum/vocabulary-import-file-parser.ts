import { parse } from "csv-parse/sync";

import { MAX_IMPORT_ROWS, REQUIRED_IMPORT_COLUMNS } from "./vocabulary-import-parsing";
import type { ImportDelimiter, ImportFileParseResult, RawVocabularyImportRow } from "./vocabulary-import-parsing";

/**
 * The one function in this feature that actually touches `csv-parse` — kept
 * out of `vocabulary-import-parsing.ts` (and so out of `domains/curriculum/index.ts`,
 * the client-safe barrel) so a Node-oriented CSV library is never a
 * candidate for the browser bundle. Import this only from server-only code
 * (a Server Action, `domains/admin/bulk-import-service.ts`, or a test).
 */

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
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
