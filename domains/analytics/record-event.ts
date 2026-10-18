import { queueAnalyticsEvent } from "./analytics-event-collector";
import { srsStageCategory } from "./analytics-events";
import type { PendingAnalyticsEvent } from "./analytics-events";

/**
 * Spec 27 Unit 27.3 — what the domains call, from inside the one place their
 * transaction only reaches on a first execution (see
 * `analytics-event-collector.ts`). One function per event the product can
 * actually produce, each taking only the fields that event's schema allows, so
 * a call site cannot pass anything else: there is no "properties" bag to spread
 * a database row into.
 *
 * These only queue. They never validate against the catalog (that happens once,
 * when the event is about to be sent, outside the transaction) and never throw.
 */

export function recordLessonCompleted(input: {
  languageId: string;
  /** The lesson session's own id (the signed state's `sessionId`) — what ties this to the browser's `lesson_started`. */
  sessionKey: string;
  /** The completion's idempotency key: a retry of the same completion is the same logical event. */
  idempotencyKey: string;
  itemCount: number;
  accuracyPercent: number;
  /** The highest curriculum level among the lesson's items. */
  level: number;
}): void {
  queueAnalyticsEvent({
    event: "lesson_completed",
    languageId: input.languageId,
    properties: {
      session_key: input.sessionKey,
      item_count: input.itemCount,
      accuracy_percent: input.accuracyPercent,
      level: input.level,
    },
    dedupeKey: `lesson_completed:${input.idempotencyKey}`,
    occurredAt: new Date(),
    source: "server",
  });
}

export function recordReviewItemCompleted(input: {
  languageId: string;
  sessionKey: string;
  idempotencyKey: string;
  contentType: "vocabulary" | "grammar";
  result: "advanced" | "penalized";
  /** The stored stage names (`beginner_2`, `master`…); only their category is ever sent. */
  stageBefore: string;
  stageAfter: string;
  level: number;
}): void {
  const before = srsStageCategory(input.stageBefore);
  const after = srsStageCategory(input.stageAfter);
  // A stage that is not a stage has no honest category; send nothing rather than a guess.
  if (!before || !after) return;
  queueAnalyticsEvent({
    event: "review_item_completed",
    languageId: input.languageId,
    properties: {
      session_key: input.sessionKey,
      content_type: input.contentType,
      result: input.result,
      srs_stage_before: before,
      srs_stage_after: after,
      level: input.level,
    },
    dedupeKey: `review_item_completed:${input.idempotencyKey}`,
    occurredAt: new Date(),
    source: "server",
  });
}

export function recordLevelUnlocked(input: {
  languageId: string;
  /** The unlocked level's id: a learner unlocks a level once, so this is what makes a repeat the same event. */
  levelId: string;
  level: number;
}): void {
  queueAnalyticsEvent({
    event: "level_unlocked",
    languageId: input.languageId,
    properties: { level: input.level },
    dedupeKey: `level_unlocked:${input.levelId}`,
    occurredAt: new Date(),
    source: "server",
  });
}

/**
 * `onboarding_completed` is not queued from inside a transaction: finishing
 * onboarding is a single update guarded on `onboarding_completed_at IS NULL`,
 * so the Server Action itself knows whether *this* request is the one that did
 * it and builds the event only then. Once per account: the dedupe key carries no
 * request detail, so two clicks that both got through are still one milestone.
 */
export function buildOnboardingCompletedEvent(input: {
  languageId: string;
}): PendingAnalyticsEvent<"onboarding_completed"> {
  return {
    event: "onboarding_completed",
    languageId: input.languageId,
    properties: {},
    dedupeKey: "onboarding_completed",
    occurredAt: new Date(),
    source: "server",
  };
}
