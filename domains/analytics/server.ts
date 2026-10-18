/**
 * Server-only entry point for `domains/analytics`. `./binding.ts` and
 * `./capture-binding.ts` transitively import `db/client.ts` — import from here
 * only in server-only files (Server Actions, route handlers, Server Components),
 * never a `"use client"` component. See `domains/users/server.ts` for why this
 * split exists.
 */
export {
  getAnalyticsConsent,
  resolveAnalyticsCaptureIdentity,
  setAnalyticsConsent,
} from "./binding";
export {
  captureAnalyticsIntent,
  runWithAnalytics,
  scheduleAnalyticsEmission,
  shouldReportAnalyticsIntents,
} from "./capture-binding";
export type { AnalyticsIntent } from "./analytics-intent";
export type {
  AnalyticsCaptureIdentity,
  SetAnalyticsConsentInput,
} from "./analytics-consent-service";
export { buildOnboardingCompletedEvent } from "./record-event";
