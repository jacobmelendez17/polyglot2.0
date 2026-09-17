import { describe, expect, it } from "vitest";

import type {
  GrammarItem,
  LearningItem,
  VocabularyItem,
} from "@/domains/curriculum";

import { getAvailableThemes, selectLessonBatch } from "./lesson-batch";

const NUMBERS = { id: "theme-numbers", name: "Numbers", position: 1 };
const GREETINGS = { id: "theme-greetings", name: "Greetings", position: 2 };
const COLORS = { id: "theme-colors", name: "Colors", position: 3 };

function makeItem(
  overrides: Partial<VocabularyItem> & { id: string },
): VocabularyItem {
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

function makeGrammar(
  overrides: Partial<GrammarItem> & { id: string },
): GrammarItem {
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
    requiredQuestions: [
      { format: "translation", direction: "targetToEnglish" },
    ],
    ...overrides,
  };
}

/** A level shaped like the real Level 1: several vocabulary groups plus its own grammar sequence. */
function makeLevel(): LearningItem[] {
  return [
    ...Array.from({ length: 4 }, (_, i) =>
      makeItem({ id: `numbers-${i}`, theme: NUMBERS, lessonPriority: i + 1 }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeItem({
        id: `greetings-${i}`,
        theme: GREETINGS,
        lessonPriority: i + 10,
      }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeItem({ id: `colors-${i}`, theme: COLORS, lessonPriority: i + 20 }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeGrammar({ id: `grammar-${i}`, lessonPriority: i + 1 }),
    ),
  ];
}

describe("selectLessonBatch", () => {
  it("respects the configured batch size", () => {
    const batch = selectLessonBatch({
      eligibleItems: makeLevel(),
      batchSize: 6,
      mode: "variety",
    });
    expect(batch).toHaveLength(6);
  });

  it("returns an empty batch for an empty eligible set", () => {
    expect(
      selectLessonBatch({ eligibleItems: [], batchSize: 6, mode: "variety" }),
    ).toEqual([]);
  });

  it("does not let the client widen the batch beyond the eligible pool", () => {
    const batch = selectLessonBatch({
      eligibleItems: [makeItem({ id: "only-item" })],
      batchSize: 6,
      mode: "variety",
    });
    expect(batch).toHaveLength(1);
  });

  it("teaches the current level only, never mixing a higher level into the same batch", () => {
    const eligibleItems = [
      makeItem({ id: "level-2-a", levelNumber: 2, lessonPriority: 1 }),
      makeItem({ id: "level-1-b", levelNumber: 1, lessonPriority: 2 }),
      makeItem({ id: "level-1-a", levelNumber: 1, lessonPriority: 1 }),
    ];
    const batch = selectLessonBatch({
      eligibleItems,
      batchSize: 6,
      mode: "variety",
    });
    expect(batch.map((item) => item.id)).toEqual(["level-1-a", "level-1-b"]);
  });

  describe("default_order mode", () => {
    it("teaches grammar first, then each vocabulary group in position order", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 20,
        mode: "default_order",
      });
      expect(batch.map((item) => item.id)).toEqual([
        "grammar-0",
        "grammar-1",
        "grammar-2",
        "grammar-3",
        "numbers-0",
        "numbers-1",
        "numbers-2",
        "numbers-3",
        "greetings-0",
        "greetings-1",
        "greetings-2",
        "greetings-3",
        "colors-0",
        "colors-1",
        "colors-2",
        "colors-3",
      ]);
    });

    it("is a plain slice of the authored sequence — a short batch stops mid-sequence, not padded from elsewhere", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 3,
        mode: "default_order",
      });
      expect(batch.map((item) => item.id)).toEqual([
        "grammar-0",
        "grammar-1",
        "grammar-2",
      ]);
    });

    it("continues into vocabulary once grammar is exhausted", () => {
      const eligibleItems = [
        makeGrammar({ id: "grammar-0", lessonPriority: 1 }),
        ...Array.from({ length: 4 }, (_, i) =>
          makeItem({
            id: `numbers-${i}`,
            theme: NUMBERS,
            lessonPriority: i + 1,
          }),
        ),
      ];
      const batch = selectLessonBatch({
        eligibleItems,
        batchSize: 3,
        mode: "default_order",
      });
      expect(batch.map((item) => item.id)).toEqual([
        "grammar-0",
        "numbers-0",
        "numbers-1",
      ]);
    });

    it("ignores Grammar Placement entirely — grammar is always first regardless", () => {
      const batchFirst = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "default_order",
        grammarPlacement: "last",
      });
      const batchDefault = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "default_order",
      });
      expect(batchFirst.map((item) => item.id)).toEqual(
        batchDefault.map((item) => item.id),
      );
      expect(batchDefault[0]?.type).toBe("grammar");
    });
  });

  describe("choose_group mode", () => {
    it("teaches only the selected group, in curriculum order", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "choose_group",
        selectedThemeId: GREETINGS.id,
      });
      const vocabulary = batch.filter((item) => item.type === "vocabulary");
      expect(vocabulary.map((item) => item.id)).toEqual([
        "greetings-0",
        "greetings-1",
        "greetings-2",
        "greetings-3",
      ]);
    });

    it("never fills a short group from another group", () => {
      const eligibleItems = [
        makeItem({ id: "family-last", theme: NUMBERS, lessonPriority: 1 }),
        ...Array.from({ length: 8 }, (_, i) =>
          makeItem({ id: `other-${i}`, theme: COLORS, lessonPriority: i + 10 }),
        ),
      ];
      const batch = selectLessonBatch({
        eligibleItems,
        batchSize: 8,
        mode: "choose_group",
        selectedThemeId: NUMBERS.id,
      });
      expect(batch.map((item) => item.id)).toEqual(["family-last"]);
    });

    it("selects nothing when no group has been chosen — the caller asks the learner instead", () => {
      expect(
        selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "choose_group",
          selectedThemeId: null,
        }),
      ).toEqual([]);
    });

    it("still teaches grammar in its own curriculum order alongside the group, unaffected by Grammar Placement", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "choose_group",
        selectedThemeId: COLORS.id,
        grammarPlacement: "first",
      });
      // The grammar share follows the level's own shape (spec 17: levels
      // hold any number of either). This fixture level is 12 vocabulary to 4
      // grammar, so a quarter of a 6-item batch is grammar — and it is the
      // grammar curriculum's first two items, in its own order, appended
      // after vocabulary regardless of the (ignored) Grammar Placement.
      expect(batch.map((item) => item.type)).toEqual([
        "vocabulary",
        "vocabulary",
        "vocabulary",
        "vocabulary",
        "grammar",
        "grammar",
      ]);
      expect(
        batch.filter((item) => item.type === "grammar").map((item) => item.id),
      ).toEqual(["grammar-0", "grammar-1"]);
    });

    it("scales the grammar share to the level, not to a fixed curriculum shape", () => {
      // A level that is almost all grammar teaches mostly grammar; a level
      // with a single grammar point spends a batch almost entirely on words.
      const grammarHeavy = [
        makeItem({ id: "solo-word", theme: NUMBERS, lessonPriority: 1 }),
        ...Array.from({ length: 11 }, (_, i) =>
          makeGrammar({ id: `g-${i}`, lessonPriority: i + 1 }),
        ),
      ];
      const heavyBatch = selectLessonBatch({
        eligibleItems: grammarHeavy,
        batchSize: 6,
        mode: "choose_group",
        selectedThemeId: NUMBERS.id,
      });
      expect(heavyBatch.filter((item) => item.type === "grammar")).toHaveLength(
        5,
      );

      const vocabularyHeavy = [
        ...Array.from({ length: 23 }, (_, i) =>
          makeItem({ id: `w-${i}`, theme: NUMBERS, lessonPriority: i + 1 }),
        ),
        makeGrammar({ id: "solo-grammar", lessonPriority: 1 }),
      ];
      const lightBatch = selectLessonBatch({
        eligibleItems: vocabularyHeavy,
        batchSize: 6,
        mode: "choose_group",
        selectedThemeId: NUMBERS.id,
      });
      expect(lightBatch.filter((item) => item.type === "grammar")).toHaveLength(
        0,
      );
    });
  });

  describe("variety mode", () => {
    it("spreads the vocabulary portion across the available groups", () => {
      const batch = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "variety",
      });
      const themes = batch
        .filter((item): item is VocabularyItem => item.type === "vocabulary")
        .map((item) => item.theme?.name);
      expect(new Set(themes)).toEqual(
        new Set(["Numbers", "Greetings", "Colors"]),
      );
    });

    it("redistributes to the remaining groups when one runs short", () => {
      const eligibleItems = [
        makeItem({ id: "numbers-only", theme: NUMBERS, lessonPriority: 1 }),
        ...Array.from({ length: 4 }, (_, i) =>
          makeItem({
            id: `greetings-${i}`,
            theme: GREETINGS,
            lessonPriority: i + 10,
          }),
        ),
        ...Array.from({ length: 4 }, (_, i) =>
          makeItem({
            id: `colors-${i}`,
            theme: COLORS,
            lessonPriority: i + 20,
          }),
        ),
      ];
      const batch = selectLessonBatch({
        eligibleItems,
        batchSize: 6,
        mode: "variety",
      });
      expect(batch).toHaveLength(6);
      expect(batch.map((item) => item.id)).toContain("numbers-only");
    });

    it("is deterministic — the same eligible curriculum always produces the same batch", () => {
      const first = selectLessonBatch({
        eligibleItems: makeLevel(),
        batchSize: 6,
        mode: "variety",
      });
      const second = selectLessonBatch({
        eligibleItems: [...makeLevel()].reverse(),
        batchSize: 6,
        mode: "variety",
      });
      expect(first.map((item) => item.id)).toEqual(
        second.map((item) => item.id),
      );
    });

    describe("Grammar Placement", () => {
      it("First: grammar comes before vocabulary", () => {
        const batch = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
          grammarPlacement: "first",
        });
        const grammarIndexes = batch.flatMap((item, index) =>
          item.type === "grammar" ? [index] : [],
        );
        const vocabularyIndexes = batch.flatMap((item, index) =>
          item.type === "vocabulary" ? [index] : [],
        );
        expect(Math.max(...grammarIndexes)).toBeLessThan(
          Math.min(...vocabularyIndexes),
        );
      });

      it("Last: grammar comes after vocabulary", () => {
        const batch = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
          grammarPlacement: "last",
        });
        const grammarIndexes = batch.flatMap((item, index) =>
          item.type === "grammar" ? [index] : [],
        );
        const vocabularyIndexes = batch.flatMap((item, index) =>
          item.type === "vocabulary" ? [index] : [],
        );
        expect(Math.min(...grammarIndexes)).toBeGreaterThan(
          Math.max(...vocabularyIndexes),
        );
      });

      it("No Preference: grammar is neither forced first nor last — it's interleaved", () => {
        const batch = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
          grammarPlacement: "no_preference",
        });
        const grammarIndexes = batch.flatMap((item, index) =>
          item.type === "grammar" ? [index] : [],
        );
        const vocabularyIndexes = batch.flatMap((item, index) =>
          item.type === "vocabulary" ? [index] : [],
        );
        expect(grammarIndexes.length).toBeGreaterThan(0);
        // Neither "First" (every grammar index before every vocabulary index)
        // nor "Last" (every grammar index after every vocabulary index).
        expect(Math.max(...grammarIndexes)).toBeGreaterThan(
          Math.min(...vocabularyIndexes),
        );
        expect(Math.min(...grammarIndexes)).toBeLessThan(
          Math.max(...vocabularyIndexes),
        );
      });

      it("No Preference never drops or duplicates an item relative to First/Last", () => {
        const first = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
          grammarPlacement: "first",
        });
        const noPreference = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
          grammarPlacement: "no_preference",
        });
        expect(new Set(noPreference.map((item) => item.id))).toEqual(
          new Set(first.map((item) => item.id)),
        );
      });

      it("defaults to No Preference when unspecified", () => {
        const withDefault = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
        });
        const explicit = selectLessonBatch({
          eligibleItems: makeLevel(),
          batchSize: 6,
          mode: "variety",
          grammarPlacement: "no_preference",
        });
        expect(withDefault.map((item) => item.id)).toEqual(
          explicit.map((item) => item.id),
        );
      });
    });
  });
});

describe("getAvailableThemes", () => {
  it("lists groups with eligible items in curriculum order", () => {
    expect(getAvailableThemes(makeLevel()).map((theme) => theme.name)).toEqual([
      "Numbers",
      "Greetings",
      "Colors",
    ]);
  });

  it("omits a group whose items are all learned", () => {
    const eligibleItems = makeLevel().filter(
      (item) => item.type !== "vocabulary" || item.theme?.id !== GREETINGS.id,
    );
    expect(
      getAvailableThemes(eligibleItems).map((theme) => theme.name),
    ).toEqual(["Numbers", "Colors"]);
  });

  it("has nothing to offer when only grammar remains", () => {
    expect(getAvailableThemes([makeGrammar({ id: "grammar-only" })])).toEqual(
      [],
    );
  });
});
