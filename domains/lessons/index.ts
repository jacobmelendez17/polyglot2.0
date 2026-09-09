/**
 * Client-safe public surface for `domains/lessons`: types and the
 * secret-free config accessors only. Server-only orchestration
 * (`startLesson`, `submitQuizAnswer`, etc.) lives in `./server.ts` instead —
 * see that file for why the split exists. Safe to value-import from here in
 * a "use client" component.
 */
export {
  getCharacterHelpers,
  getLanguageDisplayName,
  getLessonBatchSize,
  getLessonGrammarShare,
  getLessonTokenTtlSeconds,
  getRetrySpacingMinimum,
} from "./lesson-config";
export type {
  ItemSegmentState,
  LearningItemType,
  LessonBatchSummary,
  LessonCompletionSummary,
  LessonPhase,
  LessonSessionResult,
  LessonStartResult,
  LessonThemeChoice,
  QuizAnswerFeedback,
  QuizQuestionDirection,
  QuizQuestionView,
  QuizStats,
  StudyItemView,
} from "./lesson-types";
