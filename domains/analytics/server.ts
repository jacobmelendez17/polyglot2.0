/**
 * Server-only entry point for `domains/analytics`. `./binding.ts` transitively
 * imports `db/client.ts` — import from here only in server-only files (Server
 * Actions, route handlers, Server Components), never a `"use client"`
 * component. See `domains/users/server.ts` for why this split exists.
 */
export {
  getAnalyticsConsent,
  resolveAnalyticsCaptureIdentity,
  setAnalyticsConsent,
} from "./binding";
export type {
  AnalyticsCaptureIdentity,
  SetAnalyticsConsentInput,
} from "./analytics-consent-service";
