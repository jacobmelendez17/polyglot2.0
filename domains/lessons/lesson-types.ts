import type { SrsStage } from "@/domains/srs";

import type { z } from "zod";

import type { LearningItem } from "@/domains/curriculum";

import type {
  learningItemTypeSchema,
  lessonBatchItemSchema,
  lessonPhaseSchema,
  lessonQuizStateSchema,
  lessonStateSchema,
  quizQuestionDirectionSchema,
  quizQuestionSchema,
} from "./lesson-schemas";

export type LessonPhase = z.infer<typeof lessonPhaseSchema>;
export type LearningItemType = z.infer<typeof learningItemTypeSchema>;
export type QuizQuestionDirection = z.infer<typeof quizQuestionDirectionSchema>;
export type LessonBatchItem = z.infer<typeof lessonBatchItemSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type LessonQuizState = z.infer<typeof lessonQuizStateSchema>;
/** The signed ephemeral lesson-state payload (spec 07 §7). */
export type LessonState = z.infer<typeof lessonStateSchema>;

export type LessonBatchSummary = {
  itemId: string;
  itemType: LearningItemType;
  label: string;
};

export type StudyItemView = {
  itemId: string;
  itemType: LearningItemType;
  item: LearningItem;
};

export type QuizQuestionView = {
  questionId: string;
  itemId: string;
  itemType: LearningItemType;
  direction: QuizQuestionDirection;
  prompt: string;
  directionLabel: string;
};

export type ItemSegmentState = "current" | "complete" | "partial" | "not-started";

export type QuizAnswerFeedback =
  | { kind: "empty" }
  | { kind: "correct" }
  | {
      kind: "incorrect";
      reason: "missing_article" | "no_match";
      article?: string;
      userAnswer: string;
      expectedAnswer: string;
    };

export type QuizStats = {
  requiredCount: number;
  satisfiedCount: number;
  attempts: number;
  correctAttempts: number;
};

/** What a lesson action returns for the client to render — never includes accepted-answer data. */
export type LessonSessionResult = {
  token: string;
  phase: LessonPhase;
  sessionId: string;
  batch: LessonBatchSummary[];
  viewedItemIds: string[];
  studyItems?: StudyItemView[];
  currentQuestion?: QuizQuestionView;
  itemStates?: Record<string, ItemSegmentState>;
  quizStats?: QuizStats;
  feedback?: QuizAnswerFeedback;
  /**
   * Configured accent/character buttons for the language being studied (spec
   * 07 §27), resolved server-side from the language code. Sent with the
   * session so the client never has to look up language configuration — it
   * has no access to the language record, and the previous client-side
   * lookup was what forced a fixture-language import into a `"use client"`
   * component.
   */
  characterHelpers: readonly string[];
  /**
   * The language being studied's code (`es-MX`), for client-side speech
   * synthesis (spec 20 Lessons — Auto Pronunciation). Only ever set by
   * `startLesson`'s "session" result, the same way `studyItems` is —
   * auto-pronunciation only ever fires during the study phase.
   */
  languageCode?: string;
  /** Spec 20 Lessons — Auto Pronunciation. Only ever set by `startLesson`'s "session" result; see `languageCode`. */
  autoPronounceLessons?: boolean;
};

/**
 * Theme mode needs a theme before a batch exists (spec 16): the learner has
 * either never picked one or has just finished the last item in the one they
 * picked. A distinct result kind rather than an empty lesson, because the
 * two mean opposite things — "nothing left to learn" versus "tell me which
 * part you want next".
 */
export type LessonThemeChoice = { id: string; name: string; remainingCount: number };

export type LessonStartResult =
  | { kind: "empty" }
  | { kind: "choose-theme"; themes: LessonThemeChoice[] }
  | ({ kind: "session" } & LessonSessionResult);

/**
 * What the results screen renders after a lesson (spec 07 §51, §52).
 *
 * Named a *summary*, not a preview: until spec 07 unit 6 this described the
 * output of `lesson-completion-preview.ts`, which deliberately persisted
 * nothing. It now describes the outcome of a completed enrollment
 * transaction — `completeLesson` returns this plus the IDs it actually
 * enrolled. The old module is deleted; a stale "preview" name would keep
 * implying the learning loop still does not close.
 */
export type LessonCompletionSummary = {
  items: { id: string; label: string; meaning: string }[];
  /**
   * The SRS stage identifier the batch entered — not a display string. The
   * results screen renders it through `SRS_STAGE_LABELS`, so the human
   * wording lives in the SRS domain that owns the stages rather than being
   * duplicated as a literal here (which is how the old preview surfaced a
   * hardcoded "Beginner 1" that could silently drift from the real stage).
   */
  newStage: SrsStage;
  accuracy: number;
};
