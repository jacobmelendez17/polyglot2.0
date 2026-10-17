import "server-only";

import { telemetryConfig } from "@/lib/env";

import { createAnalyticsProvider } from "./create-analytics-provider";
import type { AnalyticsProvider } from "./types";

let cachedProvider: AnalyticsProvider | null = null;

/**
 * The one entry point for product analytics (spec 27 §4). Domain and
 * application code call this and never talk to PostHog directly. Resolved once
 * per server instance, so a blocked configuration is reported once, not on
 * every request.
 */
export function getAnalyticsProvider(): AnalyticsProvider {
  cachedProvider ??= createAnalyticsProvider(telemetryConfig.analytics);
  return cachedProvider;
}

export type {
  AnalyticsCaptureInput,
  AnalyticsProperties,
  AnalyticsProvider,
} from "./types";
