import { logger } from "@/lib/logging/logger";
import type { TelemetryConfig } from "@/lib/telemetry-config";

import { noopAnalyticsProvider } from "./noop";
import { PostHogAnalyticsProvider } from "./posthog";
import type { AnalyticsProvider } from "./types";

/**
 * Chooses the analytics provider for a resolved configuration. Kept apart from
 * `index.ts` (which is `server-only` and reads the real environment) so the
 * decision can be tested with a plain config object.
 *
 * Only a fully `enabled` configuration — switch on, credentials valid, $0 plan
 * confirmed, production or explicitly allowed — gets the PostHog adapter. A
 * `blocked` one is reported once, with the names of the settings that block it
 * and nothing else, and then behaves exactly like a disabled one: the no-op, no
 * requests. The application never fails because optional telemetry is
 * misconfigured (spec 27 §4).
 */
export function createAnalyticsProvider(
  config: TelemetryConfig["analytics"],
  options: { fetch?: typeof fetch } = {},
): AnalyticsProvider {
  if (config.state === "blocked") {
    logger.warn({
      event: "telemetry.config.blocked",
      provider: "posthog",
      issues: config.issues,
    });
  }

  if (config.state === "enabled") {
    return new PostHogAnalyticsProvider({
      host: config.host,
      projectToken: config.projectToken.reveal(),
      fetch: options.fetch,
    });
  }

  return noopAnalyticsProvider;
}
