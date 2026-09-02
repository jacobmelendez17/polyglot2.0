import type { SrsStage } from "@/domains/srs";

/**
 * Progress domain types (spec 08 §29). A row only exists once an item has
 * been enrolled — `srsStage` is never optional/absent here, matching the
 * schema's own `NOT NULL` invariant (`db/schema/progress.ts`).
 */
export interface ItemProgress {
  userId: string;
  learningItemId: string;
  languageId: string;
  srsStage: SrsStage;
  learnedAt: Date;
  nextReviewAt: Date | null;
  fluentAt: Date | null;
  correctCount: number;
  incorrectCount: number;
  reviewCount: number;
  lastReviewedAt: Date | null;
  version: number;
}

/** Persistent level-unlock state — independent of any particular item's progress. */
export interface LevelProgress {
  userId: string;
  levelId: string;
  unlockedAt: Date;
  completedAt: Date | null;
}
