import { describe, expect, it } from "vitest";

import {
  GRAMMAR_GROUP_NUMBER,
  parseMultiValueList,
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

  it.each(["N/A", "n/a", " N/a "])(
    "treats %j in an optional field as absent, not a literal value",
    (naValue) => {
      const result = validateVocabularyImportRow(
        {
          word: "cero",
          translation: "zero",
          level: "1",
          group: "1",
          article: naValue,
        },
        0,
      );
      expect(result.fields).toMatchObject({ article: null });
    },
  );

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

  it("carries curriculum_key/level_name/group_name through untouched, unused by this file", () => {
    // Header aliasing (e.g. `batch_name` -> `group_name`) happens in
    // `vocabulary-import-file-parser.ts`'s `normalizeHeader`, upstream of
    // this function — see that file's own alias-mapping test for coverage
    // of the actual CSV header synonym.
    const result = validateVocabularyImportRow(
      {
        word: "gato",
        translation: "cat",
        level: "2",
        group: "1",
        curriculum_key: "es-MX:vocab:k7p4m2",
        level_name: "Core Foundations",
        group_name: "Animals",
      },
      0,
    );
    expect(result.fields).toMatchObject({
      curriculumKey: "es-MX:vocab:k7p4m2",
      levelName: "Core Foundations",
      groupName: "Animals",
    });
  });

  it("leaves curriculum_key/level_name/batch_name null when absent", () => {
    const result = validateVocabularyImportRow(
      { word: "gato", translation: "cat", level: "1", group: "1" },
      0,
    );
    expect(result.fields).toMatchObject({
      curriculumKey: null,
      levelName: null,
    });
  });

  describe("spec 25 Unit 2 — explicit item_type column", () => {
    it("treats item_type=vocabulary as authoritative, ignoring the sentinel", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1",
          item_type: "vocabulary",
        },
        0,
      );
      expect(result.fieldIssues).toEqual([]);
      expect(result.fields).toMatchObject({ itemType: "vocabulary" });
    });

    it("treats item_type=grammar as authoritative even for a low, ordinary-looking group number", () => {
      const result = validateVocabularyImportRow(
        {
          word: "ser vs estar",
          translation: "to be",
          level: "3",
          group: "1",
          item_type: "grammar",
        },
        0,
      );
      expect(result.fieldIssues).toEqual([]);
      expect(result.fields).toMatchObject({
        itemType: "grammar",
        structure: "ser vs estar",
      });
    });

    it("is case-insensitive", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1",
          item_type: "Vocabulary",
        },
        0,
      );
      expect(result.fields).toMatchObject({ itemType: "vocabulary" });
    });

    it("also accepts the type alias header", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1",
          type: "vocabulary",
        },
        0,
      );
      expect(result.fields).toMatchObject({ itemType: "vocabulary" });
    });

    it("rejects an unrecognized item_type value", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1",
          item_type: "noun",
        },
        0,
      );
      expect(result.fields).toBeNull();
      expect(result.fieldIssues).toContainEqual({
        field: "item_type",
        message:
          '"noun" isn\'t a valid item type — use "vocabulary" or "grammar".',
      });
    });

    it("allows a vocabulary group number above the sentinel-mode cap once item_type is explicit", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "10",
          item_type: "vocabulary",
        },
        0,
      );
      expect(result.fieldIssues).toEqual([]);
      expect(result.fields).toMatchObject({ groupNumber: 10 });
    });

    it("still rejects a group number above the cap without an explicit item_type (sentinel mode unchanged)", () => {
      const result = validateVocabularyImportRow(
        { word: "gato", translation: "cat", level: "1", group: "10" },
        0,
      );
      expect(result.fields).toBeNull();
      expect(result.fieldIssues[0]?.field).toBe("group");
    });

    it("accepts any positive batch number for an explicit grammar row", () => {
      const result = validateVocabularyImportRow(
        {
          word: "ser vs estar",
          translation: "to be",
          level: "3",
          group: "42",
          item_type: "grammar",
        },
        0,
      );
      expect(result.fieldIssues).toEqual([]);
      expect(result.fields).toMatchObject({ itemType: "grammar" });
    });

    it("rejects a non-integer batch number even with an explicit item_type", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1.5",
          item_type: "vocabulary",
        },
        0,
      );
      expect(result.fields).toBeNull();
      expect(result.fieldIssues).toContainEqual({
        field: "group",
        message: '"1.5" isn\'t a valid batch number.',
      });
    });

    it("still requires the group/batch_number column even when item_type is explicit", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "",
          item_type: "vocabulary",
        },
        0,
      );
      expect(result.fields).toBeNull();
      expect(result.fieldIssues).toContainEqual({
        field: "group",
        message: "Missing group.",
      });
    });
  });

  describe("spec 25 Unit 2 — synonyms/variations", () => {
    it("parses synonyms into meaning-side accepted answers", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1",
          synonyms: "kitty|feline",
        },
        0,
      );
      expect(result.fields).toMatchObject({
        acceptedAnswers: [
          { side: "meaning", value: "kitty" },
          { side: "meaning", value: "feline" },
        ],
      });
    });

    it("parses variations into term-side accepted answers", () => {
      const result = validateVocabularyImportRow(
        {
          word: "celular",
          translation: "cell phone",
          level: "1",
          group: "1",
          variations: "célular",
        },
        0,
      );
      expect(result.fields).toMatchObject({
        acceptedAnswers: [{ side: "term", value: "célular" }],
      });
    });

    it("combines synonyms and variations, synonyms first", () => {
      const result = validateVocabularyImportRow(
        {
          word: "gato",
          translation: "cat",
          level: "1",
          group: "1",
          synonyms: "kitty",
          variations: "gatto",
        },
        0,
      );
      expect(result.fields).toMatchObject({
        acceptedAnswers: [
          { side: "meaning", value: "kitty" },
          { side: "term", value: "gatto" },
        ],
      });
    });

    it("produces no accepted answers for a grammar row even if synonyms/variations are present", () => {
      const result = validateVocabularyImportRow(
        {
          word: "por vs para",
          translation: "for",
          level: "3",
          group: String(GRAMMAR_GROUP_NUMBER),
          synonyms: "should be ignored",
        },
        0,
      );
      expect(result.fields).toMatchObject({ acceptedAnswers: [] });
    });
  });
});

describe("parseMultiValueList", () => {
  it("returns an empty array for undefined/blank/N-A input", () => {
    expect(parseMultiValueList(undefined)).toEqual([]);
    expect(parseMultiValueList("")).toEqual([]);
    expect(parseMultiValueList("   ")).toEqual([]);
    expect(parseMultiValueList("N/A")).toEqual([]);
  });

  it("splits on the pipe delimiter and trims each entry", () => {
    expect(parseMultiValueList(" kitty | feline |cat ")).toEqual([
      "kitty",
      "feline",
      "cat",
    ]);
  });

  it("drops empty entries produced by stray/doubled/trailing pipes", () => {
    expect(parseMultiValueList("kitty||feline|")).toEqual(["kitty", "feline"]);
  });

  it("removes exact duplicates while preserving first-occurrence order", () => {
    expect(parseMultiValueList("kitty|feline|kitty")).toEqual([
      "kitty",
      "feline",
    ]);
  });

  it("preserves accents and treats accented/unaccented forms as distinct", () => {
    expect(parseMultiValueList("sí|si")).toEqual(["sí", "si"]);
  });

  it("preserves a single unpiped value as a one-item list", () => {
    expect(parseMultiValueList("kitty")).toEqual(["kitty"]);
  });
});
