import { describe, expect, it } from "vitest";

import { validateVocabularyImportRow } from "./vocabulary-import-parsing";

describe("validateVocabularyImportRow", () => {
  it("builds ParsedVocabularyFields for a complete row, numbering it from the spreadsheet's own row 2", () => {
    const result = validateVocabularyImportRow(
      { term: "gato", primary_meaning: "cat", part_of_speech: "noun", article: "el", ipa: "/ˈga.to/" },
      0,
    );

    expect(result.rowNumber).toBe(2);
    expect(result.fieldIssues).toEqual([]);
    expect(result.fields).toMatchObject({ term: "gato", primaryMeaning: "cat", partOfSpeech: "noun", article: "el", ipa: "/ˈga.to/" });
  });

  it("treats a blank required field the same as a missing column, with fields left null", () => {
    const result = validateVocabularyImportRow({ term: "gato", primary_meaning: "  ", part_of_speech: "noun" }, 3);

    expect(result.rowNumber).toBe(5);
    expect(result.fields).toBeNull();
    expect(result.fieldIssues).toEqual([{ field: "primary_meaning", message: "Missing primary meaning." }]);
  });

  it("reports every missing required field at once, not just the first", () => {
    const result = validateVocabularyImportRow({ term: "", primary_meaning: "", part_of_speech: "" }, 0);
    expect(result.fieldIssues).toHaveLength(3);
  });

  it("turns blank optional fields into null, not empty strings", () => {
    const result = validateVocabularyImportRow({ term: "gato", primary_meaning: "cat", part_of_speech: "noun", article: "" }, 0);
    expect(result.fields?.article).toBeNull();
  });
});
