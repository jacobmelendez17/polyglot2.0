import type { DbClient } from "@/db/client";
import { logger } from "@/lib/logging/logger";
import type { AnalyticsProvider } from "@/providers/analytics/types";

import { resolveAnalyticsCaptureIdentity } from "./analytics-consent-service";
import { findLanguageCode } from "./analytics-language-repository";
import {
  validateAnalyticsEvent,
  type PendingAnalyticsEvent,
} from "./analytics-events";

/**
 * Spec 27 Unit 27.3 — turns the events a committed call queued into captures
 * for the analytics provider. It runs *after* the response (Next's `after()`,
 * see `capture-binding.ts`), never inside the transaction and never on the
 * learner's critical path, and it is built so that nothing in it can reach the
 * learner:
 *
 * - **Consent is asked again, here.** The identity comes from the capture gate,
 *   which reads the database now — not from anything known when the work
 *   committed. A learner who withdrew a moment ago gets nothing sent (spec 27
 *   §5.1), and one who never accepted costs a single indexed read.
 * - **Every event is validated against the catalog** (`validateAnalyticsEvent`)
 *   and sent only as the catalog allows. An event that is off-list, out of
 *   bounds, or for a language that cannot be found is dropped and reported by
 *   property *path* — never by value.
 * - **It never throws.** A database error, a provider that throws, a flush that
 *   rejects: each ends in a sanitized warning and a smaller `captured` count.
 *   Telemetry may be lost; the learner's result already exists and is untouched
 *   (spec 27 §6.3, §14).
 *
 * The database and provider are injected so every rule above is provable against
 * real SQL and a recording provider.
 */

export type EmitDependencies = {
  db: DbClient;
  provider: AnalyticsProvider;
  appEnvironment: "development" | "preview" | "production";
};

export type EmitOutcome = { captured: number; dropped: number };

export async function emitAnalyticsEvents(
  deps: EmitDependencies,
  input: { userId: string; events: PendingAnalyticsEvent[] },
): Promise<EmitOutcome> {
  if (input.events.length === 0) return { captured: 0, dropped: 0 };

  try {
    const identity = await resolveAnalyticsCaptureIdentity(
      deps.db,
      input.userId,
    );
    // Not consenting is the normal case and not an error: nothing to report.
    if (!identity) return { captured: 0, dropped: input.events.length };

    let captured = 0;
    let dropped = 0;
    for (const pending of input.events) {
      const languageCode = await findLanguageCode(deps.db, pending.languageId);
      if (!languageCode) {
        dropped += 1;
        logger.warn({
          event: "analytics.event.dropped",
          analyticsEvent: pending.event,
          reason: "unknown_language",
        });
        continue;
      }

      const validated = validateAnalyticsEvent(pending, {
        languageCode,
        appEnvironment: deps.appEnvironment,
      });
      if (!validated.ok) {
        dropped += 1;
        logger.warn({
          event: "analytics.event.dropped",
          analyticsEvent: pending.event,
          reason: validated.reason,
          paths: validated.paths,
        });
        continue;
      }

      deps.provider.capture({
        event: pending.event,
        distinctId: identity.distinctId,
        properties: validated.properties,
        dedupeKey: pending.dedupeKey,
        occurredAt: pending.occurredAt,
      });
      captured += 1;
    }

    // Delivery is awaited here, inside the post-response task, because a
    // serverless function can be frozen once it ends: an un-awaited send is a
    // send that may never happen.
    await deps.provider.flush();
    return { captured, dropped };
  } catch {
    // The error's own text is deliberately not logged: it can name a host or
    // quote a payload, and the learner-facing outcome is already settled.
    logger.warn({ event: "analytics.emission.failed", reason: "unexpected" });
    return { captured: 0, dropped: input.events.length };
  }
}
