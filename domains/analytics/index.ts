/**
 * Client-safe public surface for `domains/analytics`: the pure consent rules and
 * their types only, safe to value-import from a `"use client"` component. The
 * database-backed functions live in `./server.ts`.
 */
export {
  ANALYTICS_POLICY_VERSION,
  isAnalyticsCaptureAllowed,
  resolveAnalyticsConsent,
} from "./analytics-consent";
export type {
  AnalyticsConsentStatus,
  AnalyticsConsentView,
  StoredAnalyticsConsent,
} from "./analytics-consent";
export type { AnalyticsIntent } from "./analytics-intent";
