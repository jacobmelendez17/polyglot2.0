import { describe, expect, it } from "vitest";

import {
  buildLevelViewModel,
  LEVEL_NUMBER_MAX,
  LEVEL_NUMBER_MIN,
  parseLevelNumber,
} from "./level-view";
import type {
  CurriculumLearningItem,
  CurriculumVocabularyGroup,
} from "./curriculum-db-types";
import type { SrsStage } from "@/domains/srs";

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

type VocabularyLearningItem = Extract<
  CurriculumLearningItem,
  { type: "vocabulary" }
>;

function vocab(
  id: string,
  position: number,
  groupId = "group-1",
): VocabularyLearningItem {
  return {
    id,
    languageId: "lang-1",
    levelId: "level-1",
    status: "published",
    position,
    lessonPriority: position,
    version: 1,
    type: "vocabulary",
    vocabulary: {
      vocabularyGroupId: groupId,
      term: `term-${id}`,
      primaryMeaning: `meaning-${id}`,
      definition: null,
      article: null,
      partOfSpeech: "noun",
      pronunciation: null,
      ipa: null,
      context: null,
      creatorNotes: null,
      register: null,
      dictionaryFieldOverrides: [],
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
    version: 1,
    type: "grammar",
    grammar: {
      title: null,
      structure: `structure-${id}`,
      primaryMeaning: `meaning-${id}`,
      explanation: "explanation",
      category: null,
      creatorNotes: null,
      register: null,
      requiredQuestions: [
        { format: "translation", direction: "targetToEnglish" },
      ],
    },
  };
}

function group(
  id: string,
  position: number,
  name = `Group ${position}`,
): CurriculumVocabularyGroup {
  return {
    id,
    levelId: "level-1",
    languageId: "lang-1",
    name,
    position,
    status: "published",
  };
}

const NO_PROGRESS = new Map<string, SrsStage>();

describe("buildLevelViewModel", () => {
  it("splits grammar into a flat list and vocabulary into per-group lessons", () => {
    const result = buildLevelViewModel(
      [grammar("g1", 1), vocab("v1", 1)],
      [group("group-1", 1)],
      NO_PROGRESS,
    );
    expect(result.grammar).toHaveLength(1);
    expect(result.lessons).toHaveLength(1);
    expect(result.lessons[0].items).toHaveLength(1);
  });

  it("preserves the input's curriculum order within each type, not insertion/alphabetical order", () => {
    // Deliberately out of alphabetical order to prove ordering isn't re-derived.
    const result = buildLevelViewModel(
      [vocab("zebra", 1), vocab("apple", 2)],
      [group("group-1", 1)],
      NO_PROGRESS,
    );
    expect(result.lessons[0].items.map((c) => c.id)).toEqual([
      "zebra",
      "apple",
    ]);
  });

  it("returns an empty grammar list when the level has no grammar items", () => {
    const result = buildLevelViewModel(
      [vocab("v1", 1)],
      [group("group-1", 1)],
      NO_PROGRESS,
    );
    expect(result.grammar).toEqual([]);
    expect(result.lessons).toHaveLength(1);
  });

  it("returns an empty lessons list when the level has no vocabulary items", () => {
    const result = buildLevelViewModel([grammar("g1", 1)], [], NO_PROGRESS);
    expect(result.lessons).toEqual([]);
    expect(result.grammar).toHaveLength(1);
  });

  it("returns both lists empty for a level with no published curriculum at all", () => {
    const result = buildLevelViewModel([], [], NO_PROGRESS);
    expect(result.grammar).toEqual([]);
    expect(result.lessons).toEqual([]);
  });

  it("omits a group entirely when it has no published items — no empty lesson section", () => {
    const result = buildLevelViewModel(
      [vocab("v1", 1, "group-1")],
      [group("group-1", 1), group("group-2", 2)],
      NO_PROGRESS,
    );
    expect(result.lessons.map((l) => l.groupId)).toEqual(["group-1"]);
  });

  it("orders lessons by the group's position, using it as the lesson number", () => {
    const result = buildLevelViewModel(
      [vocab("v1", 1, "group-2"), vocab("v2", 1, "group-1")],
      [group("group-1", 1, "First"), group("group-2", 2, "Second")],
      NO_PROGRESS,
    );
    expect(result.lessons.map((l) => l.lessonNumber)).toEqual([1, 2]);
    expect(result.lessons.map((l) => l.name)).toEqual(["First", "Second"]);
  });

  it("composes the article into the vocabulary card's primary text (spec 10 §13)", () => {
    const item = vocab("gato", 1);
    item.vocabulary.term = "gato";
    item.vocabulary.article = "el";
    item.vocabulary.primaryMeaning = "cat";
    const result = buildLevelViewModel(
      [item],
      [group("group-1", 1)],
      NO_PROGRESS,
    );
    expect(result.lessons[0].items[0]).toEqual({
      id: "gato",
      itemType: "vocabulary",
      primary: "el gato",
      secondary: "cat",
      srsStage: null,
    });
  });

  it("does not add an article prefix when the item has none", () => {
    const item = vocab("agua", 1);
    item.vocabulary.term = "agua";
    item.vocabulary.article = null;
    item.vocabulary.primaryMeaning = "water";
    const result = buildLevelViewModel(
      [item],
      [group("group-1", 1)],
      NO_PROGRESS,
    );
    expect(result.lessons[0].items[0]?.primary).toBe("agua");
  });

  it("uses structure/primaryMeaning for a grammar card (spec 10 §14)", () => {
    const item = grammar("y", 1);
    const result = buildLevelViewModel([item], [], NO_PROGRESS);
    expect(result.grammar[0]).toEqual({
      id: "y",
      itemType: "grammar",
      primary: "structure-y",
      secondary: "meaning-y",
      srsStage: null,
    });
  });

  it("looks up each item's SRS stage from the progress map, defaulting to not-learned", () => {
    const result = buildLevelViewModel(
      [vocab("v1", 1), vocab("v2", 2)],
      [group("group-1", 1)],
      new Map([["v1", "familiar_1" as SrsStage]]),
    );
    const byId = new Map(result.lessons[0].items.map((c) => [c.id, c]));
    expect(byId.get("v1")?.srsStage).toBe("familiar_1");
    expect(byId.get("v2")?.srsStage).toBeNull();
  });

  it("counts a lesson's items that have reached Familiar+ (the real unlock threshold), not a fabricated ratio", () => {
    const result = buildLevelViewModel(
      [vocab("v1", 1), vocab("v2", 2), vocab("v3", 3)],
      [group("group-1", 1)],
      new Map([
        ["v1", "familiar_1" as SrsStage],
        ["v2", "beginner_2" as SrsStage],
      ]),
    );
    expect(result.lessons[0].qualifyingCount).toBe(1);
  });

  it("computes aggregate counts for the header", () => {
    const result = buildLevelViewModel(
      [grammar("g1", 1), grammar("g2", 2), vocab("v1", 1)],
      [group("group-1", 1)],
      NO_PROGRESS,
    );
    expect(result.counts).toEqual({
      grammarCount: 2,
      vocabularyCount: 1,
      lessonCount: 1,
    });
  });
});
