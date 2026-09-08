import { describe, expect, it } from "vitest";

import { parseVocabularyImportFile } from "./vocabulary-import-file-parser";
import { MAX_IMPORT_ROWS } from "./vocabulary-import-parsing";

describe("parseVocabularyImportFile", () => {
  it("parses a well-formed CSV into normalized-header rows", () => {
    const csv = "Word,Translation,Level,Group\ngato,cat,1,1\ncasa,house,1,2\n";
    const result = parseVocabularyImportFile(csv, ",");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      { word: "gato", translation: "cat", level: "1", group: "1" },
      { word: "casa", translation: "house", level: "1", group: "2" },
    ]);
  });

  it("parses TSV with a tab delimiter", () => {
    const tsv = "word\ttranslation\tlevel\tgroup\ngato\tcat\t1\t1\n";
    const result = parseVocabularyImportFile(tsv, "\t");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([{ word: "gato", translation: "cat", level: "1", group: "1" }]);
  });

  it("rejects a file missing a required column", () => {
    const csv = "word,level,group\ngato,1,1\n";
    const result = parseVocabularyImportFile(csv, ",");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "missing_columns", columns: ["translation"] });
  });

  it("rejects a file with no data rows", () => {
    const result = parseVocabularyImportFile("word,translation,level,group\n", ",");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("unparseable");
  });

  it("rejects a file over the row cap without ever building the row array in a usable way", () => {
    const header = "word,translation,level,group\n";
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `word${i},meaning${i},1,1`).join("\n");
    const result = parseVocabularyImportFile(header + rows, ",");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ type: "too_many_rows", count: MAX_IMPORT_ROWS + 1 });
  });

  it("returns a clean parse error instead of throwing for genuinely malformed input", () => {
    // An unterminated quoted field is a classic CSV malformation.
    const result = parseVocabularyImportFile('word,translation,level,group\n"gato,cat,1,1\n', ",");
    expect(result.ok).toBe(false);
  });
});
