import { beforeEach, describe, expect, it, vi } from "vitest";

const startObservability = vi.hoisted(() => vi.fn());
const startModuleLoaded = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
const observability = vi.hoisted(() => ({
  metrics: { state: "disabled" } as { state: string; issues?: unknown[] },
  traces: { state: "disabled" } as { state: string; issues?: unknown[] },
  logs: { state: "disabled" } as { state: string; issues?: unknown[] },
}));

vi.mock("./start", () => {
  // Evaluating this factory is the same event as loading the SDK in production.
  startModuleLoaded();
  return { startObservability };
});
vi.mock("@/lib/logging/logger", () => ({ logger: { warn } }));
vi.mock("@/lib/env", () => ({
  env: { APP_ENV: "preview", RELEASE: "abc123" },
  telemetryConfig: { analytics: { state: "disabled" }, observability },
}));

import { bootObservability } from "./boot";

const BLOCKED = {
  state: "blocked",
  issues: [
    { code: "plan_not_confirmed", setting: "GRAFANA_FREE_PLAN_CONFIRMED" },
  ],
};

beforeEach(() => {
  startObservability.mockReset();
  startModuleLoaded.mockReset();
  warn.mockReset();
  observability.metrics = { state: "disabled" };
  observability.traces = { state: "disabled" };
  observability.logs = { state: "disabled" };
});

describe("bootObservability", () => {
  it("loads nothing, starts nothing and says nothing while every signal is off", async () => {
    await bootObservability();

    expect(startModuleLoaded).not.toHaveBeenCalled();
    expect(startObservability).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports a blocked signal by name, still without loading the SDK", async () => {
    observability.metrics = BLOCKED;
    observability.logs = BLOCKED;

    await bootObservability();

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith({
      event: "telemetry.config.blocked",
      provider: "grafana",
      signal: "metrics",
      issues: BLOCKED.issues,
    });
    expect(startModuleLoaded).not.toHaveBeenCalled();
    expect(startObservability).not.toHaveBeenCalled();
  });

  it("loads the SDK and starts it, for this environment and release, when a signal is enabled", async () => {
    observability.traces = { state: "enabled" };

    await bootObservability();

    expect(startModuleLoaded).toHaveBeenCalledTimes(1);
    expect(startObservability).toHaveBeenCalledWith(observability, {
      environment: "preview",
      release: "abc123",
    });
  });

  it("leaves the reporting of a blocked signal to the SDK start when another signal is enabled, so it is not reported twice", async () => {
    observability.metrics = { state: "enabled" };
    observability.logs = BLOCKED;

    await bootObservability();

    expect(startObservability).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("never throws, even if starting fails", async () => {
    observability.metrics = { state: "enabled" };
    startObservability.mockImplementation(() => {
      throw new Error("could not start");
    });

    await expect(bootObservability()).resolves.toBeUndefined();
  });
});
