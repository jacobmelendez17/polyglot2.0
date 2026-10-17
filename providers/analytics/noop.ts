import type { AnalyticsProvider } from "./types";

/**
 * The analytics provider every environment gets unless telemetry is enabled,
 * valid and confirmed: development, tests, preview, and any production
 * deployment whose PostHog settings are off or blocked. It holds no state and
 * imports nothing that can open a connection, so using it can never send a
 * request — the property `outbound-network-guard` pins in tests.
 */
export const noopAnalyticsProvider: AnalyticsProvider = {
  capture() {},
  async flush() {},
  async shutdown() {},
};
