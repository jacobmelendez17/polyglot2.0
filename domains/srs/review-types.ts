import type { z } from "zod";

import type { ReviewResultCategory } from "./review-result";
import type {
  reviewItemSnapshotSchema,
  reviewItemTypeSchema,
  reviewQuestionDirectionSchema,
  reviewQuestionSchema,
  reviewSessionStatsSchema,
  reviewStateSchema,
} from "./review-schemas";
import type { SrsStage } from "./srs-types";

export type ReviewItemType = z.infer<typeof reviewItemTypeSchema>;
export type ReviewQuestionDirection = z.infer<typeof reviewQuestionDirectionSchema>;
export type ReviewQuestion = z.infer<typeof reviewQuestionSchema>;
export type ReviewItemSnapshot = z.infer<typeof reviewItemSnapshotSchema>;
export type ReviewSessionStats = z.infer<typeof reviewSessionStatsSchema>;
/** The signed ephemeral review-session payload (spec 09 §6). */
export type ReviewState = z.infer<typeof reviewStateSchema>;

export type ReviewQuestionView = {
  questionId: string;
  itemId: string;
  itemType: ReviewItemType;
  direction: ReviewQuestionDirection;
  prompt: string;
  directionLabel: string;
};

export type ReviewAnswerFeedback =
  | { kind: "empty" }
  | { kind: "correct" }
  | {
      kind: "incorrect";
      reason: "missing_article" | "no_match";
      article?: string;
      userAnswer: string;
      expectedAnswer: string;
    };

/**
 * A pure, unpersisted preview of the SRS mutation a just-completed item
 * would receive (spec 09 unit 3's scope boundary — "no authoritative SRS
 * mutation until the completion boundary is reached"). Unit 4 replaces the
 * function that produces this with the real atomic transaction; nothing
 * here has touched the database. Mirrors spec 07's
 * `lesson-completion-preview.ts` relationship to its later unit 6.
 */
export type ReviewItemCompletionPreview = {
  itemId: string;
  stageBefore: SrsStage;
  stageAfter: SrsStage;
  result: ReviewResultCategory;
  nextReviewAt: Date | null;
  reachedFluent: boolean;
};

/** What a review action returns for the client to render — never includes accepted-answer data. */
export type ReviewSessionResult = {
  token: string;
  sessionId: string;
  phase: "in_progress" | "complete";
  currentQuestion?: ReviewQuestionView;
  stats: ReviewSessionStats;
  feedback?: ReviewAnswerFeedback;
  /** Present only on the submit that just completed this item — one-shot, not resurfaced on later responses. */
  completedItem?: ReviewItemCompletionPreview;
};

export type ReviewStartResult = { kind: "empty"; nextReviewAt: Date | null } | ({ kind: "session" } & ReviewSessionResult);
