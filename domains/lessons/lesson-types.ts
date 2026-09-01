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
};

export type LessonStartResult = { kind: "empty" } | ({ kind: "session" } & LessonSessionResult);

/**
 * The unit-7 completion preview — see lesson-completion-preview.ts. Not a
 * real SRS enrollment result; unit 6 is blocked (progress-tracker.md).
 */
export type LessonCompletionPreview = {
  items: { id: string; label: string; meaning: string }[];
  newStage: string;
  accuracy: number;
};
