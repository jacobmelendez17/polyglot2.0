import type { z } from "zod";

import type { ReviewQuestionPresentation } from "./review-presentation";
import type { ReviewResultCategory } from "./review-result";
import type {
  reviewItemSnapshotSchema,
  reviewItemTypeSchema,
  reviewPreferencesSchema,
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
/** The session's resolved Review Type preferences (spec 20 Reviews) — see `reviewPreferencesSchema`'s docstring for why these live inside the signed state rather than being re-fetched per submit. */
export type SignedReviewPreferences = z.infer<typeof reviewPreferencesSchema>;
/** The signed ephemeral review-session payload (spec 09 §6). */
export type ReviewState = z.infer<typeof reviewStateSchema>;

export type ReviewQuestionView = {
  questionId: string;
  itemId: string;
  itemType: ReviewItemType;
  direction: ReviewQuestionDirection;
  directionLabel: string;
  /** Spec 20 Reviews — Review Types: how the client must present and answer this question. */
  presentation: ReviewQuestionPresentation;
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
    }
  /** Spec 20 Reviews — Flashcard/Cloze (Flashcard): the learner self-reported "Don't Know" after revealing the answer. Nothing more to show — they already saw it via Reveal. */
  | { kind: "self_graded_incorrect" };

/**
 * The real, persisted SRS mutation a just-completed item received (spec 09
 * §10, unit 4's `applyReviewCompletion`). Named "Preview" from spec 09 unit
 * 3, when this shape genuinely was an unpersisted preview and nothing had
 * touched the database yet (see `review-completion-preview.ts`) — kept as
 * one shape rather than introducing a duplicate type once unit 4 made it
 * real, since both producers return identical fields.
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
  /** Resolved server-side from the session's language (spec 09 §16) — the client never hardcodes these. */
  characterHelpers: readonly string[];
  stats: ReviewSessionStats;
  feedback?: ReviewAnswerFeedback;
  /** Present only on the submit that just completed this item — one-shot, not resurfaced on later responses. */
  completedItem?: ReviewItemCompletionPreview;
  /**
   * Present only when this item's completion was rejected as stale/no-longer-due
   * (spec 09 §11 — another tab/device already completed it). The session still
   * advances past this item normally; the UI should explain that the review
   * was already updated elsewhere and no additional progress change applied,
   * per spec 09 §11's explicit UI instruction, rather than a generic error.
   */
  staleItem?: { itemId: string };
};

export type ReviewStartResult = { kind: "empty"; nextReviewAt: Date | null } | ({ kind: "session" } & ReviewSessionResult);
