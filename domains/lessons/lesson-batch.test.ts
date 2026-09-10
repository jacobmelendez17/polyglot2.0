import { describe, expect, it } from "vitest";

import type { GrammarItem, LearningItem, VocabularyItem } from "@/domains/curriculum";

import { getAvailableThemes, selectLessonBatch } from "./lesson-batch";

const NUMBERS = { id: "theme-numbers", name: "Numbers", position: 1 };
const GREETINGS = { id: "theme-greetings", name: "Greetings", position: 2 };
const COLORS = { id: "theme-colors", name: "Colors", position: 3 };

function makeItem(overrides: Partial<VocabularyItem> & { id: string }): VocabularyItem {
  return {
    type: "vocabulary",
    languageId: "es-MX",
    levelNumber: 1,
    lessonPriority: 1,
    word: overrides.id,
    partOfSpeech: "noun",
    meanings: ["placeholder"],
    targetVariants: [],
    pronunciation: { guide: "placeholder" },
    examples: [],
    resources: [],
    ...overrides,
  };
}

function makeGrammar(overrides: Partial<GrammarItem> & { id: string }): GrammarItem {
  return {
    type: "grammar",
    languageId: "es-MX",
    levelNumber: 1,
    lessonPriority: 1,
    structure: overrides.id,
    meaning: "placeholder",
    explanation: "placeholder",
    examples: [],
    resources: [],
    requiredQuestions: [{ format: "translation", direction: "targetToEnglish" }],
    ...overrides,
  };
}

/** A small deterministic generator, so Random mode's tests describe fixed behavior rather than a sample. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** A level shaped like the real Level 1: several themes of vocabulary plus its own grammar sequence. */
function makeLevel(): LearningItem[] {
  return [
    ...Array.from({ length: 4 }, (_, i) => makeItem({ id: `numbers-${i}`, theme: NUMBERS, lessonPriority: i + 1 })),
    ...Array.from({ length: 4 }, (_, i) => makeItem({ id: `greetings-${i}`, theme: GREETINGS, lessonPriority: i + 10 })),
    ...Array.from({ length: 4 }, (_, i) => makeItem({ id: `colors-${i}`, theme: COLORS, lessonPriority: i + 20 })),
    ...Array.from({ length: 4 }, (_, i) => makeGrammar({ id: `grammar-${i}`, lessonPriority: i + 1 })),
  ];
}

describe("selectLessonBatch", () => {
  it("respects the configured batch size", () => {
    const batch = selectLessonBatch({ eligibleItems: makeLevel(), batchSize: 6, mode: "balanced" });
    expect(batch).toHaveLength(6);
  });

  it("returns an empty batch for an empty eligible set", () => {
    expect(selectLessonBatch({ eligibleItems: [], batchSize: 6, mode: "balanced" })).toEqual([]);
  });

  it("does not let the client widen the batch beyond the eligible pool", () => {
    const batch = selectLessonBatch({ eligibleItems: [makeItem({ id: "only-item" })], batchSize: 6, mode: "balanced" });
    expect(batch).toHaveLength(1);
  });

  it("teaches the current level only, never mixing a higher level into the same batch", () => {
    const eligibleItems = [
      makeItem({ id: "level-2-a", levelNumber: 2, lessonPriority: 1 }),
      makeItem({ id: "level-1-b", levelNumber: 1, lessonPriority: 2 }),
      makeItem({ id: "level-1-a", levelNumber: 1, lessonPriority: 1 }),
    ];
    const batch = selectLessonBatch({ eligibleItems, batchSize: 6, mode: "balanced" });
    expect(batch.map((item) => item.id)).toEqual(["level-1-a", "level-1-b"]);
  });

  describe("theme mode", () => {
    it("teaches only the selected theme, in curriculum order", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "theme",
        selectedThemeId: GREETINGS.id,
      });
      const vocabulary = batch.filter((item) => item.type === "vocabulary");
      expect(vocabulary.map((item) => item.id)).toEqual(["greetings-0", "greetings-1", "greetings-2", "greetings-3"]);
    });

    it("never fills a short theme from another theme", () => {
      const eligibleItems = [
        makeItem({ id: "family-last", theme: NUMBERS, lessonPriority: 1 }),
        ...Array.from({ length: 8 }, (_, i) => makeItem({ id: `other-${i}`, theme: COLORS, lessonPriority: i + 10 })),
      ];
      const batch = selectLessonBatch({ eligibleItems, batchSize: 8, mode: "theme", selectedThemeId: NUMBERS.id });
      expect(batch.map((item) => item.id)).toEqual(["family-last"]);
    });

    it("selects nothing when no theme has been chosen — the caller asks the learner instead", () => {
      expect(selectLessonBatch({ eligibleItems: makeLevel(), batchSize: 6, mode: "theme", selectedThemeId: null })).toEqual([]);
    });

    it("still teaches grammar in its own curriculum order alongside the theme", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "theme",
        selectedThemeId: COLORS.id,
      });
      // The grammar share follows the level's own shape (spec 17: levels
      // hold any number of either). This fixture level is 12 vocabulary to 4
      // grammar, so a quarter of a 6-item batch is grammar — and it is the
      // grammar curriculum's first two items, in its own order.
      expect(batch.filter((item) => item.type === "grammar").map((item) => item.id)).toEqual(["grammar-0", "grammar-1"]);
    });

    it("scales the grammar share to the level, not to a fixed curriculum shape", () => {
      // A level that is almost all grammar teaches mostly grammar; a level
      // with a single grammar point spends a batch almost entirely on words.
      const grammarHeavy = [
        makeItem({ id: "solo-word", theme: NUMBERS, lessonPriority: 1 }),
        ...Array.from({ length: 11 }, (_, i) => makeGrammar({ id: `g-${i}`, lessonPriority: i + 1 })),
      ];
      const heavyBatch = selectLessonBatch({ eligibleItems: grammarHeavy, batchSize: 6, mode: "theme", selectedThemeId: NUMBERS.id });
      expect(heavyBatch.filter((item) => item.type === "grammar")).toHaveLength(5);

      const vocabularyHeavy = [
        ...Array.from({ length: 23 }, (_, i) => makeItem({ id: `w-${i}`, theme: NUMBERS, lessonPriority: i + 1 })),
        makeGrammar({ id: "solo-grammar", lessonPriority: 1 }),
      ];
      const lightBatch = selectLessonBatch({ eligibleItems: vocabularyHeavy, batchSize: 6, mode: "theme", selectedThemeId: NUMBERS.id });
      expect(lightBatch.filter((item) => item.type === "grammar")).toHaveLength(0);
    });
  });

  describe("balanced mode", () => {
    it("spreads the vocabulary portion across the available themes", () => {
      const batch = selectLessonBatch({ eligibleItems: makeLevel(), batchSize: 6, mode: "balanced" });
      const themes = batch
        .filter((item): item is VocabularyItem => item.type === "vocabulary")
        .map((item) => item.theme?.name);
      expect(new Set(themes)).toEqual(new Set(["Numbers", "Greetings", "Colors"]));
    });

    it("redistributes to the remaining themes when one runs short", () => {
      const eligibleItems = [
        makeItem({ id: "numbers-only", theme: NUMBERS, lessonPriority: 1 }),
        ...Array.from({ length: 4 }, (_, i) => makeItem({ id: `greetings-${i}`, theme: GREETINGS, lessonPriority: i + 10 })),
        ...Array.from({ length: 4 }, (_, i) => makeItem({ id: `colors-${i}`, theme: COLORS, lessonPriority: i + 20 })),
      ];
      const batch = selectLessonBatch({ eligibleItems, batchSize: 6, mode: "balanced" });
      expect(batch).toHaveLength(6);
      expect(batch.map((item) => item.id)).toContain("numbers-only");
    });

    it("is deterministic — the same eligible curriculum always produces the same batch", () => {
      const first = selectLessonBatch({ eligibleItems: makeLevel(), batchSize: 6, mode: "balanced" });
      const second = selectLessonBatch({ eligibleItems: [...makeLevel()].reverse(), batchSize: 6, mode: "balanced" });
      expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    });
  });

  describe("random mode", () => {
    it("mixes grammar and vocabulary together", () => {
      // Seeded rather than real randomness, so this asserts the actual
      // behavior every run instead of passing on a lucky draw.
      const batch = selectLessonBatch({ eligibleItems: makeLevel(), batchSize: 6, mode: "random", random: seededRandom(1) });
      expect(batch).toHaveLength(6);
      expect(batch.some((item) => item.type === "grammar")).toBe(true);
      expect(batch.some((item) => item.type === "vocabulary")).toBe(true);
    });

    it("never exceeds the batch size or leaves the current level", () => {
      const eligibleItems = [...makeLevel(), makeItem({ id: "level-2", levelNumber: 2, lessonPriority: 1 })];
      const batch = selectLessonBatch({ eligibleItems, batchSize: 6, mode: "random", random: seededRandom(3) });
      expect(batch).toHaveLength(6);
      expect(batch.every((item) => item.levelNumber === 1)).toBe(true);
    });
  });
});

describe("getAvailableThemes", () => {
  it("lists themes with eligible items in curriculum order", () => {
    expect(getAvailableThemes(makeLevel()).map((theme) => theme.name)).toEqual(["Numbers", "Greetings", "Colors"]);
  });

  it("omits a theme whose items are all learned", () => {
    const eligibleItems = makeLevel().filter((item) => item.type !== "vocabulary" || item.theme?.id !== GREETINGS.id);
    expect(getAvailableThemes(eligibleItems).map((theme) => theme.name)).toEqual(["Numbers", "Colors"]);
  });

  it("has nothing to offer when only grammar remains", () => {
    expect(getAvailableThemes([makeGrammar({ id: "grammar-only" })])).toEqual([]);
  });
});
