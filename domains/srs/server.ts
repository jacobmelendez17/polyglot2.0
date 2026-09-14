/**
 * Server-only entry point for `domains/srs`. `./review-service.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files, never a `"use client"` component. `./index.ts` stays
 * safe for a client component to value-import (types + pure stage/interval
 * rules only). See `domains/progress/server.ts` / `domains/curriculum/server.ts`
 * for the same pattern and why it exists.
 */
export {
  getReviewHistory,
  getReviewPreferences,
  getReviewTimestampsInWindow,
  insertReviewEvent,
  startReviewSession,
  submitReviewAnswer,
  updateGrammarFluentMode,
  updateGrammarHintMode,
  updateGrammarHintOrder,
  updateGrammarReviewType,
  updateGrammarSrsIntervalMode,
  updateGrammarSrsStrictness,
  updateReviewQueueTiming,
  updateReviewUiToggle,
  updateUndoAction,
  updateVocabularyFluentMode,
  updateVocabularyHintMode,
  updateVocabularyHintOrder,
  updateVocabularyReviewType,
  updateVocabularySrsIntervalMode,
  updateVocabularySrsStrictness,
} from "./review-service";
export type { ReviewAnswerSubmission, StartReviewSessionInput, SubmitReviewAnswerInput } from "./review-orchestration";
