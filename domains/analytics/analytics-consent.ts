/**
 * Spec 27 Unit 27.2 — the pure rules of product-analytics consent. No database,
 * no request, no clock: what a stored choice means today.
 *
 * The model, in one paragraph. Nothing is captured about a learner until they
 * have explicitly accepted, and that choice lives on the server so it holds on
 * every device. Having made no choice and having declined both mean "do not
 * capture"; only an acceptance under the *current* notice counts. Withdrawing
 * is always honoured at once and never expires.
 */

/**
 * The version of the analytics notice and of the wording beside the Settings
 * switch (`app/(app)/settings/privacy/page.tsx`). Bump it when either changes
 * materially: every acceptance recorded under an older version stops counting —
 * capture refuses it and the learner is asked to choose again. A decline is
 * never invalidated this way.
 */
export const ANALYTICS_POLICY_VERSION = "2026-10-17";

/** What is stored for a learner who has chosen. No stored choice is `null`, not a value of this type. */
export type StoredAnalyticsConsent = {
  status: "accepted" | "declined";
  policyVersion: string;
  /** The random, analytics-only pseudonym events are filed under. Present whenever `status` is `accepted`. */
  analyticsId: string | null;
  revision: number;
};

export type AnalyticsConsentStatus = "unknown" | "accepted" | "declined";

/** What the Settings page needs to know. Never carries the analytics id. */
export type AnalyticsConsentView = {
  /** What counts today: `accepted` only while the stored acceptance is for the current notice version. */
  status: AnalyticsConsentStatus;
  /** The token the next change must name; `null` while nothing is stored. */
  revision: number | null;
  /** The learner accepted an earlier version of the notice, so they are asked to choose again. */
  needsReview: boolean;
};

export function resolveAnalyticsConsent(
  stored: StoredAnalyticsConsent | null,
  currentPolicyVersion: string = ANALYTICS_POLICY_VERSION,
): AnalyticsConsentView {
  if (!stored) return { status: "unknown", revision: null, needsReview: false };
  if (stored.status === "declined") {
    return {
      status: "declined",
      revision: stored.revision,
      needsReview: false,
    };
  }
  if (stored.policyVersion === currentPolicyVersion) {
    return {
      status: "accepted",
      revision: stored.revision,
      needsReview: false,
    };
  }
  return { status: "unknown", revision: stored.revision, needsReview: true };
}

/**
 * The one test for "may an event be captured about this learner right now".
 * Default deny: only a current acceptance that has its pseudonym passes.
 */
export function isAnalyticsCaptureAllowed(
  stored: StoredAnalyticsConsent | null,
  currentPolicyVersion: string = ANALYTICS_POLICY_VERSION,
): boolean {
  return (
    stored !== null &&
    stored.analyticsId !== null &&
    resolveAnalyticsConsent(stored, currentPolicyVersion).status === "accepted"
  );
}
