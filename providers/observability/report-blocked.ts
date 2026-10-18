import type { logger } from "@/lib/logging/logger";
import type { TelemetryConfig } from "@/lib/telemetry-config";

/**
 * Spec 27 §4 — a Grafana signal whose switch is on but which cannot run safely
 * is `blocked`: it behaves exactly like a disabled one, and the reason is
 * reported once, by name. The warning names the settings and the kind of
 * problem (`{ code, setting }`) and never a value: a secret pasted into the
 * wrong variable is the realistic leak.
 *
 * Its own module, with nothing from the OpenTelemetry SDK, so the check can
 * run — and a misconfiguration be reported — without loading the SDK.
 */
export function reportBlockedSignals(
  config: TelemetryConfig["observability"],
  warn: typeof logger.warn,
): void {
  for (const signal of ["metrics", "traces", "logs"] as const) {
    const state = config[signal];
    if (state.state !== "blocked") continue;
    warn({
      event: "telemetry.config.blocked",
      provider: "grafana",
      signal,
      issues: state.issues,
    });
  }
}
