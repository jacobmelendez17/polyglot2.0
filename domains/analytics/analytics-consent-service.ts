import type { DbClient } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";

import {
  ANALYTICS_POLICY_VERSION,
  isAnalyticsCaptureAllowed,
  resolveAnalyticsConsent,
} from "./analytics-consent";
import type { AnalyticsConsentView } from "./analytics-consent";
import {
  findCaptureConsent,
  findStoredAnalyticsConsent,
  isSandboxAccount,
  saveAcceptedConsent,
  saveDeclinedConsent,
} from "./analytics-consent-repository";

/**
 * Spec 27 Unit 27.2 — analytics consent, with the database injected so every
 * rule can be proved against real SQL. `./binding.ts` supplies the real `db`
 * and the rate limit (the same split `domains/danger-zone` uses).
 *
 * The server is the only authority. Nothing here, and nothing the Settings page
 * sends, can say "capture is allowed"; the capture path asks
 * `resolveAnalyticsCaptureIdentity` again, against the database, every time.
 */

/** What the Settings page shows. A learner who has never chosen reads as `unknown`, which denies capture. */
export async function getAnalyticsConsent(
  db: DbClient,
  userId: string,
): Promise<AnalyticsConsentView> {
  return resolveAnalyticsConsent(await findStoredAnalyticsConsent(db, userId));
}

export type SetAnalyticsConsentInput = {
  userId: string;
  status: "accepted" | "declined";
  /**
   * The revision the caller's page last showed (`null` when it showed no stored
   * choice). Required for an acceptance, where it is what stops a stale or
   * delayed request from another device overwriting a newer decision; ignored
   * for a decline, which must always work.
   */
  expectedRevision: number | null;
};

/**
 * Saves the learner's choice. Refuses a sandbox persona (analytics are never
 * collected for a testing fixture, mirroring how onboarding refuses to write for
 * one), and answers an acceptance based on an out-of-date view with
 * `STALE_SETTING` instead of applying it.
 */
export async function setAnalyticsConsent(
  db: DbClient,
  input: SetAnalyticsConsentInput,
): Promise<AnalyticsConsentView> {
  // Re-proved against the database, not taken from the caller: the flag a
  // Server Action holds came from the same session, but the rule belongs to the
  // service, not to whoever happens to call it.
  const isSandbox = await isSandboxAccount(db, input.userId);
  if (isSandbox === null) {
    throw new AppError("ITEM_NOT_FOUND", "That account could not be found.");
  }
  if (isSandbox) {
    throw new AppError(
      "FORBIDDEN",
      "Usage analytics are never collected for sandbox personas.",
    );
  }

  if (input.status === "declined") {
    return resolveAnalyticsConsent(
      await saveDeclinedConsent(db, {
        userId: input.userId,
        policyVersion: ANALYTICS_POLICY_VERSION,
      }),
    );
  }

  const result = await saveAcceptedConsent(db, {
    userId: input.userId,
    policyVersion: ANALYTICS_POLICY_VERSION,
    expectedRevision: input.expectedRevision,
  });
  if (!result.saved) {
    throw new AppError(
      "STALE_SETTING",
      "Your analytics choice was changed on another device. Reload this page to see the current choice.",
    );
  }
  return resolveAnalyticsConsent(result.consent);
}

/** The identity an analytics event about a learner may be filed under. */
export type AnalyticsCaptureIdentity = {
  /** The random pseudonym — never a Clerk id, an email or a Polyglot user id. */
  distinctId: string;
};

/**
 * The capture gate (spec 27 §5.1: "every server-side capture rechecks the
 * latest server preference"). Returns the learner's pseudonym only while a
 * current acceptance is stored, and `null` for everyone else — no choice, a
 * decline, an acceptance under an older notice, a sandbox persona, or no such
 * account. It reads the database on every call and keeps nothing: a withdrawal
 * that has committed is seen by the very next call, on any device.
 *
 * What it cannot do is recall an event already accepted for delivery before the
 * withdrawal committed; that one may still arrive (spec 27 §5.1 says so).
 */
export async function resolveAnalyticsCaptureIdentity(
  db: DbClient,
  userId: string,
): Promise<AnalyticsCaptureIdentity | null> {
  const stored = await findCaptureConsent(db, userId);
  if (!stored || !stored.analyticsId || !isAnalyticsCaptureAllowed(stored)) {
    return null;
  }
  return { distinctId: stored.analyticsId };
}
