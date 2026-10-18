import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FLUSH_TIMEOUT_MS,
  DEFAULT_METRICS_IDLE_FLUSH_MS,
  ExportCoordinator,
  type Flushers,
} from "./export-coordinator";

type FakeTimer = {
  task: () => void;
  ms: number;
  cleared: boolean;
  fired: boolean;
  unref: () => void;
};

function harness(
  flushers: Flushers,
  overrides: { flushTimeoutMs?: number } = {},
) {
  let clock = 1_000_000;
  const timers: FakeTimer[] = [];
  const coordinator = new ExportCoordinator({
    flushers,
    now: () => clock,
    setTimer: (task, ms) => {
      const timer: FakeTimer = {
        task,
        ms,
        cleared: false,
        fired: false,
        unref: () => undefined,
      };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      if (handle && typeof handle === "object")
        (handle as FakeTimer).cleared = true;
    },
    ...overrides,
  });
  return {
    coordinator,
    timers,
    advance: (ms: number) => void (clock += ms),
    fire: (timer: FakeTimer) => {
      timer.fired = true;
      timer.task();
    },
    idleTimer: () =>
      timers.find(
        (timer) =>
          timer.ms === DEFAULT_METRICS_IDLE_FLUSH_MS &&
          !timer.cleared &&
          !timer.fired,
      ),
  };
}

function recorders() {
  return {
    traces: vi.fn(async () => undefined),
    logs: vi.fn(async () => undefined),
    metrics: vi.fn(async () => undefined),
  };
}

/** Lets every pending microtask run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("ExportCoordinator", () => {
  it("flushes traces, logs and — the first time — metrics when a request ends", async () => {
    const flushers = recorders();
    const { coordinator } = harness(flushers);

    coordinator.requestEnded();
    await settle();

    expect(flushers.traces).toHaveBeenCalledTimes(1);
    expect(flushers.logs).toHaveBeenCalledTimes(1);
    expect(flushers.metrics).toHaveBeenCalledTimes(1);
  });

  it("flushes traces and logs after every request, but metrics at most once per interval", async () => {
    const flushers = recorders();
    const { coordinator, advance } = harness(flushers);

    coordinator.requestEnded();
    await settle();
    advance(10_000);
    coordinator.requestEnded();
    await settle();
    advance(10_000);
    coordinator.requestEnded();
    await settle();

    expect(flushers.traces).toHaveBeenCalledTimes(3);
    expect(flushers.logs).toHaveBeenCalledTimes(3);
    expect(flushers.metrics).toHaveBeenCalledTimes(1);

    advance(15_000); // 35 s since the metrics went out
    coordinator.requestEnded();
    await settle();

    expect(flushers.metrics).toHaveBeenCalledTimes(2);
  });

  it("sends the metrics a few seconds after the last request, if the function is still running", async () => {
    const flushers = recorders();
    const { coordinator, advance, idleTimer, fire } = harness(flushers);

    coordinator.requestEnded();
    await settle();
    advance(5_000);
    coordinator.requestEnded(); // too soon for metrics: an idle flush is armed instead
    await settle();

    expect(flushers.metrics).toHaveBeenCalledTimes(1);
    const timer = idleTimer();
    expect(timer).toBeDefined();

    fire(timer!);
    await settle();

    expect(flushers.metrics).toHaveBeenCalledTimes(2);
  });

  it("does not leave an idle flush armed once the metrics have gone out another way", async () => {
    const flushers = recorders();
    const { coordinator, advance, idleTimer } = harness(flushers);

    coordinator.requestEnded();
    await settle();
    advance(5_000);
    coordinator.requestEnded();
    await settle();
    expect(idleTimer()).toBeDefined();

    advance(40_000);
    coordinator.requestEnded(); // metrics are due again: they go out now
    await settle();

    expect(flushers.metrics).toHaveBeenCalledTimes(2);
    expect(idleTimer()).toBeUndefined();
  });

  it("never runs two flush cycles at once; a request that ends during one makes the same cycle go round again", async () => {
    let release!: () => void;
    let inFlight = 0;
    let peak = 0;
    const traces = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      if (traces.mock.calls.length === 1) {
        await new Promise<void>((resolve) => (release = resolve));
      }
      inFlight -= 1;
    });
    const { coordinator } = harness({ traces });

    coordinator.requestEnded();
    await settle();
    coordinator.requestEnded(); // arrives while the first is still sending
    coordinator.requestEnded();
    await settle();
    expect(traces).toHaveBeenCalledTimes(1);

    release();
    await settle();

    expect(traces).toHaveBeenCalledTimes(2); // once more, not once per request
    expect(peak).toBe(1);
  });

  it("hands the platform a promise that settles when the cycle is done", async () => {
    let release!: () => void;
    const { coordinator } = harness({
      traces: () => new Promise<void>((resolve) => (release = resolve)),
    });
    const waitUntil = vi.fn();

    coordinator.requestEnded(waitUntil);
    await settle();

    expect(waitUntil).toHaveBeenCalledTimes(1);
    let settled = false;
    void (waitUntil.mock.calls[0]![0] as Promise<void>).then(() => {
      settled = true;
    });
    await settle();
    expect(settled).toBe(false);

    release();
    await settle();
    expect(settled).toBe(true);
  });

  it("gives up on a flush that never finishes, so a slow Grafana cannot hold a function open for ever", async () => {
    const { coordinator, timers, fire } = harness({
      traces: () => new Promise<void>(() => undefined),
    });
    const waitUntil = vi.fn();

    coordinator.requestEnded(waitUntil);
    await settle();
    const timeout = timers.find(
      (timer) => timer.ms === DEFAULT_FLUSH_TIMEOUT_MS,
    )!;
    expect(timeout).toBeDefined();
    fire(timeout);

    await expect(waitUntil.mock.calls[0]![0]).resolves.toBeUndefined();
  });

  it("carries on when one flusher fails, and never rejects", async () => {
    const flushers = recorders();
    flushers.traces.mockRejectedValue(new Error("postgres://user:secret@host"));
    const { coordinator } = harness(flushers);
    const waitUntil = vi.fn();

    coordinator.requestEnded(waitUntil);

    await expect(waitUntil.mock.calls[0]![0]).resolves.toBeUndefined();
    expect(flushers.logs).toHaveBeenCalledTimes(1);
    expect(flushers.metrics).toHaveBeenCalledTimes(1);
  });

  it("sees spans that other processors add in the same tick as the request's end", async () => {
    const buffered: string[] = [];
    const seen: string[][] = [];
    const { coordinator } = harness({
      traces: async () => void seen.push([...buffered]),
    });

    coordinator.requestEnded();
    buffered.push("this request's own span"); // a processor that runs after ours

    await settle();
    expect(seen).toEqual([["this request's own span"]]);
  });

  it("sends everything on demand, whatever the interval", async () => {
    const flushers = recorders();
    const { coordinator } = harness(flushers);
    coordinator.requestEnded();
    await settle();

    await coordinator.flushAll();

    expect(flushers.metrics).toHaveBeenCalledTimes(2);
  });

  it("does nothing after it has been stopped, and cancels a pending idle flush", async () => {
    const flushers = recorders();
    const { coordinator, advance, idleTimer } = harness(flushers);
    coordinator.requestEnded();
    await settle();
    advance(1_000);
    coordinator.requestEnded();
    await settle();
    expect(idleTimer()).toBeDefined();

    coordinator.stop();
    coordinator.requestEnded();
    await settle();

    expect(idleTimer()).toBeUndefined();
    expect(flushers.traces).toHaveBeenCalledTimes(2);
  });

  it("works with only some signals enabled", async () => {
    const metrics = vi.fn(async () => undefined);
    const { coordinator } = harness({ metrics });

    coordinator.requestEnded();
    await settle();

    expect(metrics).toHaveBeenCalledTimes(1);
  });
});
