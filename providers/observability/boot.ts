import { env, telemetryConfig } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

import { reportBlockedSignals } from "./report-blocked";

/**
 * Spec 27 Units 27.5–27.6 — the production entry point: reads the resolved
 * telemetry settings and starts whatever is enabled. `instrumentation.ts` calls
 * it once per server instance. It never throws.
 *
 * It decides before it loads anything: the OpenTelemetry SDK is a sizeable set
 * of modules, and an installation with telemetry off — the default, and every
 * test — must not pay to load it at every cold start. So the SDK is imported
 * only when at least one Grafana signal is `enabled`; a configuration with only
 * `blocked` signals is reported by name here and starts nothing.
 */
export async function bootObservability(): Promise<void> {
  try {
    const config = telemetryConfig.observability;
    const anyEnabled = [config.metrics, config.traces, config.logs].some(
      (signal) => signal.state === "enabled",
    );
    if (!anyEnabled) {
      reportBlockedSignals(config, logger.warn);
      return;
    }

    // `startObservability` reports any blocked signal itself.
    const { startObservability } = await import("./start");
    startObservability(config, {
      environment: env.APP_ENV,
      release: env.RELEASE,
    });
  } catch {
    // Optional telemetry must not stop the application from starting.
  }
}
