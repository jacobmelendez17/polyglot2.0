import { logger } from "@/lib/logging/logger";
import type { TelemetryConfig } from "@/lib/telemetry-config";

import { noopAnalyticsProvider } from "./noop";
import type { AnalyticsProvider } from "./types";

/**
 * Chooses the analytics provider for a resolved configuration. Kept apart from
 * `index.ts` (which is `server-only` and reads the real environment) so the
 * decision can be tested with a plain config object.
 *
 * A `blocked` provider is reported once, with the names of the settings that
 * block it and nothing else, and then behaves exactly like a disabled one —
 * the application never fails because optional telemetry is misconfigured
 * (spec 27 §4).
 */
export function createAnalyticsProvider(
  config: TelemetryConfig["analytics"],
): AnalyticsProvider {
  if (config.state === "blocked") {
    logger.warn({
      event: "telemetry.config.blocked",
      provider: "posthog",
      issues: config.issues,
    });
  }

  // Unit 27.3 returns the PostHog adapter here when `config.state` is
  // "enabled". Until it exists nothing in this codebase can send an event, so
  // even a fully valid, confirmed configuration resolves to the no-op: turning
  // the flags on today changes nothing.
  return noopAnalyticsProvider;
}
