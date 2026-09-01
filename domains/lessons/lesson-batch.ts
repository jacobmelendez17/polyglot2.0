import type { LearningItem } from "@/domains/curriculum";

import type { LessonBatchItem } from "./lesson-types";

export type SelectLessonBatchInput = {
  eligibleItems: LearningItem[];
  batchSize: number;
};

/**
 * Pure, server-authoritative batch selection (spec 07 §2, §10). Sorts by
 * curriculum level first (lower unlocked levels take priority), then by
 * within-level lesson priority, and takes the first `batchSize`. Callers
 * must never accept a client-chosen batch — this is the only place batch
 * membership is decided.
 */
export function selectLessonBatch({ eligibleItems, batchSize }: SelectLessonBatchInput): LearningItem[] {
  const sorted = [...eligibleItems].sort((a, b) => {
    if (a.levelId !== b.levelId) return a.levelId - b.levelId;
    return a.lessonPriority - b.lessonPriority;
  });
  return sorted.slice(0, batchSize);
}

export function toLessonBatchItems(items: LearningItem[]): LessonBatchItem[] {
  return items.map((item) => ({ itemId: item.id, itemType: item.type }));
}
