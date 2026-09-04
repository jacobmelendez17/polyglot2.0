import { describe, expect, it } from "vitest";

import { buildLevelViewModel, LEVEL_NUMBER_MAX, LEVEL_NUMBER_MIN, parseLevelNumber } from "./level-view";
import type { CurriculumLearningItem } from "./curriculum-db-types";

describe("parseLevelNumber", () => {
  it("accepts every valid level 1-50", () => {
    expect(parseLevelNumber("1")).toBe(1);
    expect(parseLevelNumber("25")).toBe(25);
    expect(parseLevelNumber("50")).toBe(50);
  });

  it(`rejects 0 and ${LEVEL_NUMBER_MAX + 1} as out of range`, () => {
    expect(parseLevelNumber("0")).toBeNull();
    expect(parseLevelNumber(String(LEVEL_NUMBER_MAX + 1))).toBeNull();
  });

  it("rejects non-numeric, decimal, negative, and malformed input", () => {
    expect(parseLevelNumber("abc")).toBeNull();
    expect(parseLevelNumber("12.5")).toBeNull();
    expect(parseLevelNumber("-1")).toBeNull();
    expect(parseLevelNumber("")).toBeNull();
    expect(parseLevelNumber("07x")).toBeNull();
    expect(parseLevelNumber("1e2")).toBeNull();
    expect(parseLevelNumber(" 5")).toBeNull();
  });

  it(`the valid range is exactly ${LEVEL_NUMBER_MIN}-${LEVEL_NUMBER_MAX}`, () => {
    expect(LEVEL_NUMBER_MIN).toBe(1);
    expect(LEVEL_NUMBER_MAX).toBe(50);
  });
});

type VocabularyLearningItem = Extract<CurriculumLearningItem, { type: "vocabulary" }>;

function vocab(id: string, position: number): VocabularyLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position,
    lessonPriority: position,
    type: "vocabulary",
    vocabulary: {
      vocabularyGroupId: "group-1",
      term: `term-${id}`,
      primaryMeaning: `meaning-${id}`,
      definition: null,
      article: null,
      partOfSpeech: "noun",
      pronunciation: null,
      ipa: null,
      context: null,
      creatorNotes: null,
    },
  };
}

function grammar(id: string, position: number): CurriculumLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position,
    lessonPriority: position,
    type: "grammar",
    grammar: {
      title: null,
      structure: `structure-${id}`,
      primaryMeaning: `meaning-${id}`,
      explanation: "explanation",
      category: null,
      creatorNotes: null,
      requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
    },
  };
}

describe("buildLevelViewModel", () => {
  it("splits grammar and vocabulary into separate lists", () => {
    const result = buildLevelViewModel([grammar("g1", 1), vocab("v1", 1)]);
    expect(result.grammar).toHaveLength(1);
    expect(result.vocabulary).toHaveLength(1);
  });

  it("preserves the input's curriculum order within each type, not insertion/alphabetical order", () => {
    // Deliberately out of alphabetical order to prove ordering isn't re-derived.
    const result = buildLevelViewModel([vocab("zebra", 1), vocab("apple", 2)]);
    expect(result.vocabulary.map((c) => c.id)).toEqual(["zebra", "apple"]);
  });

  it("returns an empty grammar list when the level has no grammar items", () => {
    const result = buildLevelViewModel([vocab("v1", 1)]);
    expect(result.grammar).toEqual([]);
    expect(result.vocabulary).toHaveLength(1);
  });

  it("returns an empty vocabulary list when the level has no vocabulary items", () => {
    const result = buildLevelViewModel([grammar("g1", 1)]);
    expect(result.vocabulary).toEqual([]);
    expect(result.grammar).toHaveLength(1);
  });

  it("returns both lists empty for a level with no published curriculum at all", () => {
    const result = buildLevelViewModel([]);
    expect(result.grammar).toEqual([]);
    expect(result.vocabulary).toEqual([]);
  });

  it("composes the article into the vocabulary card's primary text (spec 10 §13)", () => {
    const item = vocab("gato", 1);
    item.vocabulary.term = "gato";
    item.vocabulary.article = "el";
    item.vocabulary.primaryMeaning = "cat";
    const result = buildLevelViewModel([item]);
    expect(result.vocabulary[0]).toEqual({ id: "gato", itemType: "vocabulary", primary: "el gato", secondary: "cat" });
  });

  it("does not add an article prefix when the item has none", () => {
    const item = vocab("agua", 1);
    item.vocabulary.term = "agua";
    item.vocabulary.article = null;
    item.vocabulary.primaryMeaning = "water";
    const result = buildLevelViewModel([item]);
    expect(result.vocabulary[0]?.primary).toBe("agua");
  });

  it("uses structure/primaryMeaning for a grammar card (spec 10 §14)", () => {
    const item = grammar("y", 1);
    const result = buildLevelViewModel([item]);
    expect(result.grammar[0]).toEqual({ id: "y", itemType: "grammar", primary: "structure-y", secondary: "meaning-y" });
  });
});
