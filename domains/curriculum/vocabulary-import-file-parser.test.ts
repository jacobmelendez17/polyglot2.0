import { describe, expect, it } from "vitest";

import { parseVocabularyImportFile } from "./vocabulary-import-file-parser";
import { MAX_IMPORT_ROWS } from "./vocabulary-import-parsing";

describe("parseVocabularyImportFile", () => {
  it("parses a well-formed CSV into normalized-header rows", () => {
    const csv = "Term,Primary Meaning,Part Of Speech\ngato,cat,noun\ncasa,house,noun\n";
    const result = parseVocabularyImportFile(csv, ",");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { term: "gato", primary_meaning: "cat", part_of_speech: "noun" },
      { term: "casa", primary_meaning: "house", part_of_speech: "noun" },
    ]);
  });

  it("parses TSV with a tab delimiter", () => {
    const tsv = "term\tprimary_meaning\tpart_of_speech\ngato\tcat\tnoun\n";
    const result = parseVocabularyImportFile(tsv, "\t");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([{ term: "gato", primary_meaning: "cat", part_of_speech: "noun" }]);
  });

  it("rejects a file missing a required column", () => {
    const csv = "term,part_of_speech\ngato,noun\n";
    const result = parseVocabularyImportFile(csv, ",");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "missing_columns", columns: ["primary_meaning"] });
  });

  it("rejects a file with no data rows", () => {
    const result = parseVocabularyImportFile("term,primary_meaning,part_of_speech\n", ",");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("unparseable");
  });

  it("rejects a file over the row cap without ever building the row array in a usable way", () => {
    const header = "term,primary_meaning,part_of_speech\n";
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `word${i},meaning${i},noun`).join("\n");
    const result = parseVocabularyImportFile(header + rows, ",");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "too_many_rows", count: MAX_IMPORT_ROWS + 1 });
  });

  it("returns a clean parse error instead of throwing for genuinely malformed input", () => {
    // An unterminated quoted field is a classic CSV malformation.
    const result = parseVocabularyImportFile('term,primary_meaning,part_of_speech\n"gato,cat,noun\n', ",");
    expect(result.ok).toBe(false);
  });
});
