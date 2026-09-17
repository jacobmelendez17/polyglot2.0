import { z } from "zod";

import {
  GHOST_MODES,
  HINT_MODES,
  HINT_ORDERS,
  REVIEW_QUEUE_TIMING_MODES,
  REVIEW_TYPES,
  SRS_INTERVAL_MODES,
  SRS_STRICTNESSES,
} from "./review-preference";
import type {
  GhostMode,
  HintMode,
  HintOrder,
  ReviewQueueTimingMode,
  ReviewType,
  SrsIntervalMode,
  SrsStrictness,
} from "./review-preference";
import { SRS_STAGE_ORDER } from "./srs-config";
import type { SrsStage } from "./srs-types";

/**
 * The signed ephemeral review-session state shape (spec 09 §6). Zod is the
 * source of truth — types are inferred from these schemas — so the decoded
 * token payload is always re-validated at the trust boundary in
 * `review-token.ts`'s `verifyReviewState`, mirroring spec 07's
 * `lesson-schemas.ts`/`lesson-token.ts` pattern exactly.
 */

// Derived from the one canonical `SRS_STAGE_ORDER`, not duplicated — the
// cast only widens the tuple type for `z.enum`'s signature; the runtime
// values and literal inference both still come from that array.
export const srsStageSchema = z.enum(
  SRS_STAGE_ORDER as unknown as readonly [SrsStage, ...SrsStage[]],
);

export const reviewItemTypeSchema = z.enum(["vocabulary", "grammar"]);

export const reviewQuestionDirectionSchema = z.enum([
  "targetToEnglish",
  "englishToTarget",
]);

export const reviewQuestionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  itemType: reviewItemTypeSchema,
  direction: reviewQuestionDirectionSchema,
});

/**
 * The server-created review snapshot for one due item (spec 09 §6, §11) —
 * captured when the session started, compared against the real, reloaded
 * `user_item_progress` row at completion time so a second completion of the
 * same item (another tab/device) is detected as stale rather than silently
 * re-applied (spec 09 §11). `version` is `user_item_progress.version`
 * (spec 08 §26's optimistic-concurrency column).
 */
export const reviewItemSnapshotSchema = z.object({
  itemId: z.string().min(1),
  stage: srsStageSchema,
  version: z.number().int().min(0),
  /** The item's curriculum level number, captured at session start so the completion boundary can resolve the accelerated-schedule rule (spec 08 §34) without an extra query. */
  levelNumber: z.number().int().min(1),
});

export const reviewSessionStatsSchema = z.object({
  itemsTotal: z.number().int().min(0),
  itemsCompleted: z.number().int().min(0),
  questionsAttempted: z.number().int().min(0),
  questionsCorrect: z.number().int().min(0),
});

const reviewTypeSchema = z.enum(
  REVIEW_TYPES as unknown as readonly [ReviewType, ...ReviewType[]],
);
const hintOrderSchema = z.enum(
  HINT_ORDERS as unknown as readonly [HintOrder, ...HintOrder[]],
);
const hintModeSchema = z.enum(
  HINT_MODES as unknown as readonly [HintMode, ...HintMode[]],
);
const srsStrictnessSchema = z.enum(
  SRS_STRICTNESSES as unknown as readonly [SrsStrictness, ...SrsStrictness[]],
);
const srsIntervalModeSchema = z.enum(
  SRS_INTERVAL_MODES as unknown as readonly [
    SrsIntervalMode,
    ...SrsIntervalMode[],
  ],
);
const reviewQueueTimingModeSchema = z.enum(
  REVIEW_QUEUE_TIMING_MODES as unknown as readonly [
    ReviewQueueTimingMode,
    ...ReviewQueueTimingMode[],
  ],
);
const ghostModeSchema = z.enum(
  GHOST_MODES as unknown as readonly [GhostMode, ...GhostMode[]],
);

/**
 * Spec 20 Reviews' "Review Session Settings": resolved once at session
 * start and carried inside the signed state from then on, exactly like
 * `itemSnapshots` — "the active review keeps its original settings [...]
 * the next review session uses the new settings," never a setting change
 * mid-session. Re-fetching this per submit instead of trusting the signed
 * copy would violate that directly.
 *
 * Review Type, Review Hints, SRS Strictness, SRS Interval, Review Queue
 * Timing, Fluent Mode, and Ghost Reviews all live here — each affects
 * either what `buildQuestionView` computes server-side per question, or the
 * authoritative stage/schedule transition itself at completion time
 * (`review-completion.ts`; Ghost Mode specifically gates
 * `domains/srs/ghost-repository.ts`'s `recordSentenceMiss`, called from
 * `submitReviewAnswer`'s incorrect-answer branch). The seven Review UI toggles
 * (Autoplay Audio, Lightning Mode, Focus Mode, Auto Highlight Errors, Show
 * SRS Stage, Auto-Expand Info, Undo Action) are pure client presentation
 * with no effect on grading or SRS, so they ride once in
 * `ReviewSessionResult` instead (see `review-types.ts`) rather than being
 * signed into every request.
 */
export const reviewPreferencesSchema = z.object({
  grammarReviewType: reviewTypeSchema,
  vocabularyReviewType: reviewTypeSchema,
  grammarHintOrder: hintOrderSchema,
  vocabularyHintOrder: hintOrderSchema,
  grammarHintMode: hintModeSchema,
  vocabularyHintMode: hintModeSchema,
  grammarSrsStrictness: srsStrictnessSchema,
  vocabularySrsStrictness: srsStrictnessSchema,
  grammarSrsIntervalMode: srsIntervalModeSchema,
  vocabularySrsIntervalMode: srsIntervalModeSchema,
  reviewQueueTiming: reviewQueueTimingModeSchema,
  grammarFluentMode: z.boolean(),
  vocabularyFluentMode: z.boolean(),
  grammarGhostMode: ghostModeSchema,
  vocabularyGhostMode: ghostModeSchema,
});

export const reviewStateSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  languageId: z.string().min(1),
  /**
   * Spec 20 Review Queue Timing — the learner's `users.timezone` at session
   * start, resolved once alongside `reviewPreferences` for the identical
   * reason: Start of Day's calendar-date alignment must stay consistent for
   * the life of one session, even if the learner changes their timezone in
   * another tab mid-session.
   */
  timeZone: z.string().min(1),
  questions: z.array(reviewQuestionSchema).min(1),
  /** Remaining question ids, in order — `queue[0]` is the current question. */
  queue: z.array(z.string().min(1)),
  satisfiedQuestionIds: z.array(z.string().min(1)),
  /** Question ids that were ever answered incorrectly this session — never removed once added (spec 09 §8's "retain the earlier incorrect result"). */
  failedQuestionIds: z.array(z.string().min(1)),
  /** Items whose completion preview has already fired this session — prevents re-triggering on a replayed/duplicate submit. */
  completedItemIds: z.array(z.string().min(1)),
  itemSnapshots: z.array(reviewItemSnapshotSchema).min(1),
  reviewPreferences: reviewPreferencesSchema,
  stats: reviewSessionStatsSchema,
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});
