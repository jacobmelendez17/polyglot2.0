import { describe, expect, it } from "vitest";

import type { VocabularyItem } from "@/domains/curriculum";

import { selectLessonBatch } from "./lesson-batch";

function makeItem(overrides: Partial<VocabularyItem> & { id: string }): VocabularyItem {
  return {
    type: "vocabulary",
    languageId: "es-MX",
    levelId: 1,
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

describe("selectLessonBatch", () => {
  it("respects the configured batch size", () => {
    const eligibleItems = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `item-${i}`, levelId: 1, lessonPriority: i }),
    );
    const batch = selectLessonBatch({ eligibleItems, batchSize: 6 });
    expect(batch).toHaveLength(6);
  });

  it("uses the default batch size of 6 when the eligible pool is larger", () => {
    const eligibleItems = Array.from({ length: 8 }, (_, i) =>
      makeItem({ id: `item-${i}`, levelId: 1, lessonPriority: i }),
    );
    const batch = selectLessonBatch({ eligibleItems, batchSize: 6 });
    expect(batch.map((item) => item.id)).toEqual(["item-0", "item-1", "item-2", "item-3", "item-4", "item-5"]);
  });

  it("prioritizes lower unlocked curriculum levels over higher ones", () => {
    const eligibleItems = [
      makeItem({ id: "level-2-a", levelId: 2, lessonPriority: 1 }),
      makeItem({ id: "level-1-b", levelId: 1, lessonPriority: 2 }),
      makeItem({ id: "level-1-a", levelId: 1, lessonPriority: 1 }),
    ];
    const batch = selectLessonBatch({ eligibleItems, batchSize: 3 });
    expect(batch.map((item) => item.id)).toEqual(["level-1-a", "level-1-b", "level-2-a"]);
  });

  it("returns an empty batch for an empty eligible set", () => {
    const batch = selectLessonBatch({ eligibleItems: [], batchSize: 6 });
    expect(batch).toEqual([]);
  });

  it("does not let the client widen the batch beyond the eligible pool", () => {
    const eligibleItems = [makeItem({ id: "only-item" })];
    const batch = selectLessonBatch({ eligibleItems, batchSize: 6 });
    expect(batch).toHaveLength(1);
  });
});
