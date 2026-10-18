import { db } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";
import { env, telemetryConfig } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { getAnalyticsProvider } from "@/providers/analytics";
import { getRateLimiter } from "@/providers/rate-limit";

import { runAfterResponse } from "./after-response";
import { resolveAnalyticsCaptureIdentity } from "./analytics-consent-service";
import { collectAnalyticsEvents } from "./analytics-event-collector";
import { emitAnalyticsEvents } from "./analytics-emitter";
import type { AnalyticsIntent } from "./analytics-intent";
import type { PendingAnalyticsEvent } from "./analytics-events";

/**
 * Spec 27 Unit 27.3 — binds the real database, provider and request lifecycle to
 * the injectable emitter, and is where "analytics is off" costs nothing.
 *
 * Every function here starts from the same check: when product analytics is not
 * `enabled` (switch off, blocked, or not production), it does no work at all —
 * no collection scope, no database read, no scheduled task. A deployment that
 * has not turned analytics on pays for none of this.
 */

function analyticsIsEnabled(): boolean {
  const { state } = telemetryConfig.analytics;
  // A blocked configuration still does nothing, but it must not do it silently
  // (spec 27 §4: say why instead of failing quietly). Resolving the provider is
  // what reports it — once per server instance, naming the setting and never its
  // value — and every later call is a cached read.
  if (state === "blocked") getAnalyticsProvider();
  return state === "enabled";
}

/** Hands queued events to the emitter after the response. A no-op when there is nothing to send or analytics is off. */
export function scheduleAnalyticsEmission(
  userId: string,
  events: PendingAnalyticsEvent[],
): void {
  // It is called after the learner's own write has succeeded, so it must not be
  // able to turn that success into an error message — whatever goes wrong here
  // is a lost event and a warning, nothing more.
  try {
    if (!analyticsIsEnabled() || events.length === 0) return;
    runAfterResponse(async () => {
      await emitAnalyticsEvents(
        {
          db,
          provider: getAnalyticsProvider(),
          appEnvironment: env.APP_ENV,
        },
        { userId, events },
      );
    });
  } catch {
    logger.warn({ event: "analytics.emission.failed", reason: "schedule" });
  }
}

/**
 * Runs a Server Action's domain call so that whatever it commits can be
 * reported. The events its transaction queued are emitted — after the response,
 * after a consent check — only if the call returns; if it throws, they are
 * discarded with it (see `analytics-event-collector.ts`). The result is returned
 * untouched, and a failure in emission can never reach it.
 */
export async function runWithAnalytics<T>(
  context: { userId: string },
  work: () => Promise<T>,
): Promise<T> {
  if (!analyticsIsEnabled()) return work();

  const { result, events } = await collectAnalyticsEvents(work);
  scheduleAnalyticsEmission(context.userId, events);
  return result;
}

/**
 * Whether a page should ask the browser to report that a session started: only
 * when analytics is on *and* this learner currently consents. Everyone else
 * never has the report fired at all. The report endpoint checks again.
 *
 * It runs while a lesson or review page renders, so it can never be the reason
 * that page fails: a consent read that errors answers "no" (and a warning that
 * names no one and quotes nothing), and the session simply is not reported.
 */
export async function shouldReportAnalyticsIntents(
  userId: string,
): Promise<boolean> {
  if (!analyticsIsEnabled()) return false;
  try {
    return (await resolveAnalyticsCaptureIdentity(db, userId)) !== null;
  } catch {
    logger.warn({
      event: "analytics.intent.check_failed",
      reason: "unexpected",
    });
    return false;
  }
}

/**
 * The first-party endpoint behind the browser's "a session started" reports
 * (spec 27 §4: browser-originated events go through an authenticated, validated,
 * consent-checked server endpoint, never a browser SDK).
 *
 * The caller has already authenticated and validated the input. Here: nothing
 * happens unless analytics is enabled; the report spends the intent rate limit
 * (and is refused, not queued, when it is spent); and the event is scheduled for
 * emission, where consent is checked against the database.
 */
export async function captureAnalyticsIntent(input: {
  userId: string;
  languageId: string;
  intent: AnalyticsIntent;
}): Promise<void> {
  if (!analyticsIsEnabled()) return;

  const decision = await getRateLimiter().check({
    policy: "analytics-intent",
    subject: input.userId,
  });
  if (!decision.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Please slow down and try again in ${decision.retryAfterSeconds}s.`,
    );
  }

  const { intent } = input;
  const pending: PendingAnalyticsEvent =
    intent.event === "onboarding_started"
      ? {
          event: "onboarding_started",
          languageId: input.languageId,
          properties: {},
          // Once per account: entering onboarding again is the same milestone.
          dedupeKey: "onboarding_started",
          occurredAt: new Date(),
          source: "browser_intent",
        }
      : {
          event: intent.event,
          languageId: input.languageId,
          properties: { session_key: intent.sessionKey },
          dedupeKey: `${intent.event}:${intent.sessionKey}`,
          occurredAt: new Date(),
          source: "browser_intent",
        };

  scheduleAnalyticsEmission(input.userId, [pending]);
}
