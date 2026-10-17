import { db } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";
import { getRateLimiter } from "@/providers/rate-limit";

import * as consentService from "./analytics-consent-service";
import type {
  AnalyticsCaptureIdentity,
  SetAnalyticsConsentInput,
} from "./analytics-consent-service";
import type { AnalyticsConsentView } from "./analytics-consent";

/**
 * Binds the real `db` and the rate limiter to the injectable consent service —
 * the same split `domains/danger-zone/binding.ts` uses. `server.ts` exports
 * from here, never from the service file, so a real Server Action always goes
 * through the rate limit.
 */

export async function getAnalyticsConsent(
  userId: string,
): Promise<AnalyticsConsentView> {
  return consentService.getAnalyticsConsent(db, userId);
}

/**
 * Saves the learner's choice under the ordinary Settings limit (`account-settings`):
 * a consent change is one settings row, not progress, and fails closed like every
 * other policy — a refused save costs the learner a retry and nothing else.
 */
export async function setAnalyticsConsent(
  input: SetAnalyticsConsentInput,
): Promise<AnalyticsConsentView> {
  const decision = await getRateLimiter().check({
    policy: "account-settings",
    subject: input.userId,
  });
  if (!decision.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Please slow down and try again in ${decision.retryAfterSeconds}s.`,
    );
  }

  const view = await consentService.setAnalyticsConsent(db, input);

  // A consent change is rare and privacy-relevant, so it is worth an INFO line.
  // It carries the outcome and the revision only: no user id, no analytics id.
  logger.info({
    event: "analytics.consent.saved",
    status: view.status,
    revision: view.revision,
  });
  return view;
}

/** The capture gate for server-side event emission (Unit 27.3): re-reads the stored choice on every call. */
export async function resolveAnalyticsCaptureIdentity(
  userId: string,
): Promise<AnalyticsCaptureIdentity | null> {
  return consentService.resolveAnalyticsCaptureIdentity(db, userId);
}
