import { describe, expect, it } from "vitest";

import {
  GRAMMAR_GROUP_NUMBER,
  validateVocabularyImportRow,
} from "./vocabulary-import-parsing";

describe("validateVocabularyImportRow", () => {
  it("builds ParsedVocabularyFields for a complete row, numbering it from the spreadsheet's own row 2", () => {
    const result = validateVocabularyImportRow(
      {
        word: "gato",
        translation: "cat",
        level: "1",
        group: "2",
        part_of_speech: "noun",
        article: "el",
        ipa: "/ˈga.to/",
      },
      0,
    );

    expect(result.rowNumber).toBe(2);
    expect(result.fieldIssues).toEqual([]);
    expect(result.fields).toMatchObject({
      itemType: "vocabulary",
      levelNumber: 1,
      groupNumber: 2,
      term: "gato",
      primaryMeaning: "cat",
      partOfSpeech: "noun",
      article: "el",
      ipa: "/ˈga.to/",
    });
  });

  it("defaults part_of_speech to an empty string when omitted — it's optional now", () => {
    const result = validateVocabularyImportRow(
      { word: "gato", translation: "cat", level: "1", group: "1" },
      0,
    );
    expect(result.fields).toMatchObject({
      itemType: "vocabulary",
      partOfSpeech: "",
    });
  });

  it("treats a blank required field the same as a missing column, with fields left null", () => {
    const result = validateVocabularyImportRow(
      { word: "gato", translation: "  ", level: "1", group: "1" },
      3,
    );

    expect(result.rowNumber).toBe(5);
    expect(result.fields).toBeNull();
    expect(result.fieldIssues).toEqual([
      { field: "translation", message: "Missing translation." },
    ]);
  });

  it("reports every missing required field at once, not just the first", () => {
    const result = validateVocabularyImportRow(
      { word: "", translation: "", level: "", group: "" },
      0,
    );
    expect(result.fieldIssues).toHaveLength(4);
  });

  it("rejects a non-numeric level", () => {
    const result = validateVocabularyImportRow(
      { word: "gato", translation: "cat", level: "one", group: "1" },
      0,
    );
    expect(result.fields).toBeNull();
    expect(result.fieldIssues).toEqual([
      { field: "level", message: '"one" isn\'t a valid level number.' },
    ]);
  });

  it("rejects a group number outside 1-5", () => {
    const result = validateVocabularyImportRow(
      { word: "gato", translation: "cat", level: "1", group: "6" },
      0,
    );
    expect(result.fields).toBeNull();
    expect(result.fieldIssues[0]?.field).toBe("group");
  });

  it("turns blank optional fields into null, not empty strings", () => {
    const result = validateVocabularyImportRow(
      { word: "gato", translation: "cat", level: "1", group: "1", article: "" },
      0,
    );
    expect(result.fields).toMatchObject({ article: null });
  });

  it(`treats group ${GRAMMAR_GROUP_NUMBER} as a grammar row — word/translation become structure/primaryMeaning, explanation is left blank`, () => {
    const result = validateVocabularyImportRow(
      {
        word: "ser vs estar",
        translation: "to be (permanent vs temporary)",
        level: "3",
        group: String(GRAMMAR_GROUP_NUMBER),
      },
      0,
    );

    expect(result.fieldIssues).toEqual([]);
    expect(result.fields).toMatchObject({
      itemType: "grammar",
      levelNumber: 3,
      structure: "ser vs estar",
      primaryMeaning: "to be (permanent vs temporary)",
      explanation: "",
      requiredQuestions: [
        { format: "translation", direction: "targetToEnglish" },
      ],
    });
    expect(result.fields).not.toHaveProperty("groupNumber");
  });

  it("carries creator_notes through for a grammar row, since that field applies to both types", () => {
    const result = validateVocabularyImportRow(
      {
        word: "por vs para",
        translation: "for",
        level: "3",
        group: String(GRAMMAR_GROUP_NUMBER),
        creator_notes: "commonly confused",
      },
      0,
    );
    expect(result.fields).toMatchObject({ creatorNotes: "commonly confused" });
  });
});
