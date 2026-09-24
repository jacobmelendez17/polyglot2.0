import type { z } from "zod";

import type { GhostStage } from "./ghost-progress";
import type { ReviewHintView } from "./review-hint";
import type { ReviewPreferences } from "./review-preference";
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
export type ReviewQuestionDirection = z.infer<
  typeof reviewQuestionDirectionSchema
>;
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
  /** Spec 20 Review Hints: the optional aid content this question may reveal before answering. */
  hint: ReviewHintView;
  /** The item's target-language word/structure (spec 20 Review UI — Autoplay Audio) — never the English meaning, regardless of direction. */
  pronunciationText: string;
};

/**
 * Spec 20 Ghost Reviews — one due supplemental Ghost review, "visually
 * identifiable as supplemental." Deliberately not part of the signed
 * `ReviewState`/`queue` the way normal questions are — grading a Ghost
 * answer needs no replay-protected session snapshot (nothing about it is
 * client-supplied state to protect: the sentence is re-derived fresh from
 * `ghostProgressId` server-side on submit, the same way normal Cloze
 * grading never trusts an echoed accepted answer), so `submitGhostAnswer`
 * takes a plain authenticated request instead of a token. Always
 * Cloze-typed-shaped — Ghost's presentation is not affected by the
 * learner's Review Type setting, which governs *normal* reviews only.
 */
export type GhostReviewView = {
  ghostProgressId: string;
  itemId: string;
  itemType: ReviewItemType;
  ghostStage: GhostStage;
  sentenceBefore: string;
  sentenceAfter: string;
};

/** Spec 20 Review UI: the seven purely-presentational toggles, sent once (see `reviewPreferencesSchema`'s docstring for why these aren't signed into the session state). */
export type ReviewUiPreferences = Omit<
  ReviewPreferences,
  | "userId"
  | "languageId"
  | "grammarReviewType"
  | "vocabularyReviewType"
  | "grammarHintOrder"
  | "vocabularyHintOrder"
  | "grammarHintMode"
  | "vocabularyHintMode"
  | "grammarSrsStrictness"
  | "vocabularySrsStrictness"
  | "grammarSrsIntervalMode"
  | "vocabularySrsIntervalMode"
  | "reviewQueueTiming"
  | "grammarFluentMode"
  | "vocabularyFluentMode"
  | "grammarGhostMode"
  | "vocabularyGhostMode"
  | "grammarMinimumLeechStage"
  | "vocabularyMinimumLeechStage"
>;

/**
 * What the learner sees about an item right after missing it, so they can
 * study it before moving on. Built server-side from real, published item
 * content only — nothing invented.
 */
export type ReviewItemInfo = {
  /** The item's target-language word/structure. */
  title: string;
  meaning: string;
  /** Vocabulary only, e.g. "noun". */
  partOfSpeech: string | null;
  pronunciation: string | null;
  /** Vocabulary definition / grammar explanation. */
  explanation: string | null;
  /** The item's nuance/context note or creator notes. */
  note: string | null;
  examples: { targetText: string; translation: string }[];
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
      itemInfo: ReviewItemInfo;
    }
  /** Spec 20 Reviews — Flashcard/Cloze (Flashcard): the learner self-reported "Don't Know" after revealing the answer. */
  | { kind: "self_graded_incorrect"; itemInfo: ReviewItemInfo };

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
  /**
   * The language being reviewed's code (`es-MX`), for client-side speech
   * synthesis (spec 20 Review UI — Autoplay Audio). Only ever set by
   * `startReviewSession`'s "session" result — the same "only the initial
   * mount needs it" precedent `domains/lessons`' `languageCode` established.
   */
  languageCode?: string;
  /** Spec 20 Review UI. Only ever set by `startReviewSession`'s "session" result; see `languageCode`. */
  reviewUiPreferences?: ReviewUiPreferences;
  /**
   * Spec 20 Ghost Reviews — every due supplemental Ghost, "in addition to
   * normal reviews." Only ever set by `startReviewSession`'s result (both
   * the "empty" and "session" variants — a Ghost can be due even when no
   * normal review is) — resolved fresh at session start, not maintained
   * through later submits the way `queue` is, since answering one doesn't
   * touch the signed normal-review state at all.
   */
  ghostReviews?: GhostReviewView[];
  stats: ReviewSessionStats;
  feedback?: ReviewAnswerFeedback;
  /** The item this submit answered — what the session summary lists as "worked on". Never sent before the answer, since `title` is the target-language answer. */
  answeredItem?: {
    itemId: string;
    title: string;
    meaning: string;
    /** An official example sentence for the item (the Cloze sentence when one was shown), for the summary to display and pronounce. */
    sentence: { targetText: string; translation: string } | null;
  };
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

export type ReviewStartResult =
  | {
      kind: "empty";
      nextReviewAt: Date | null;
      ghostReviews: GhostReviewView[];
    }
  | ({ kind: "session" } & ReviewSessionResult);
