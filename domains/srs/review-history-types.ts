import type { ReviewResultCategory } from "./review-result";
import type { SrsStage } from "./srs-types";

/** One persisted review outcome (spec 09 §14) — aggregate, never a raw-answer transcript. */
export interface ReviewEvent {
  id: string;
  userId: string;
  languageId: string;
  learningItemId: string;
  reviewedAt: Date;
  stageBefore: SrsStage;
  stageAfter: SrsStage;
  requiredQuestionCount: number;
  incorrectAdjustmentCount: number;
  result: ReviewResultCategory;
  createdAt: Date;
}

export type InsertReviewEventInput = {
  userId: string;
  languageId: string;
  learningItemId: string;
  reviewedAt: Date;
  stageBefore: SrsStage;
  stageAfter: SrsStage;
  requiredQuestionCount: number;
  incorrectAdjustmentCount: number;
  result: ReviewResultCategory;
};

export type GetReviewHistoryInput = {
  userId: string;
  languageId: string;
  limit: number;
  /** Opaque cursor from a previous page's `nextCursor`; omit for the first page. */
  cursor?: string | null;
};

export type ReviewHistoryPage = {
  items: ReviewEvent[];
  /** Opaque cursor for the next page, or `null` when this page is the last. */
  nextCursor: string | null;
};
