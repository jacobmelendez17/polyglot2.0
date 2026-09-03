import { z } from "zod";

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
export const srsStageSchema = z.enum(SRS_STAGE_ORDER as unknown as readonly [SrsStage, ...SrsStage[]]);

export const reviewItemTypeSchema = z.enum(["vocabulary", "grammar"]);

export const reviewQuestionDirectionSchema = z.enum(["targetToEnglish", "englishToTarget"]);

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

export const reviewStateSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  languageId: z.string().min(1),
  questions: z.array(reviewQuestionSchema).min(1),
  /** Remaining question ids, in order — `queue[0]` is the current question. */
  queue: z.array(z.string().min(1)),
  satisfiedQuestionIds: z.array(z.string().min(1)),
  /** Question ids that were ever answered incorrectly this session — never removed once added (spec 09 §8's "retain the earlier incorrect result"). */
  failedQuestionIds: z.array(z.string().min(1)),
  /** Items whose completion preview has already fired this session — prevents re-triggering on a replayed/duplicate submit. */
  completedItemIds: z.array(z.string().min(1)),
  itemSnapshots: z.array(reviewItemSnapshotSchema).min(1),
  stats: reviewSessionStatsSchema,
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});
