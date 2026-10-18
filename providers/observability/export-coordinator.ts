import type { WaitUntil } from "./wait-until";

/**
 * Spec 27 Unit 27.5/27.6 — when buffered telemetry is sent, in a function that
 * may be frozen after every response and charged (on Vercel Hobby) for the CPU
 * time it uses.
 *
 * The policy, and why:
 *
 * - **Traces and logs flush at the end of every request.** Their buffers are
 *   empty unless that request produced something (only 5% of requests are
 *   sampled; only warnings and errors are exported), and flushing an empty
 *   buffer sends nothing, so this costs almost nothing and means a sampled
 *   trace or an error is on its way before the function can be frozen.
 * - **Metrics flush at most once every thirty seconds**, plus once a few seconds
 *   after the last request (if the function is still running). A metrics
 *   export is a full snapshot, so one per request would be most of the
 *   telemetry CPU cost for no gain; cumulative counters lose nothing by
 *   waiting for the next flush. What it can lose is the last few seconds of
 *   counts if the instance is recycled before the next request — accepted, and
 *   written down in the runbook.
 * - **One flush runs at a time.** A request that ends during a flush marks it
 *   dirty and the same cycle runs once more, instead of starting another.
 * - **Bounded.** One cycle waits at most `flushTimeoutMs`; the exporters have
 *   their own, shorter timeouts. A slow Grafana can delay a function's
 *   shutdown by that much and no more, and never a learner's response.
 *
 * Nothing here throws or rejects, and nothing logs: a failed export is counted
 * by the guarded exporters, and a log line about a failed log export would feed
 * the very thing that is failing.
 */

export type Flushers = {
  traces?: () => Promise<void>;
  logs?: () => Promise<void>;
  metrics?: () => Promise<void>;
};

export type TimerHandle = { unref?: () => unknown } | number | undefined;

export type ExportCoordinatorOptions = {
  flushers: Flushers;
  metricsMinIntervalMs?: number;
  metricsIdleFlushMs?: number;
  flushTimeoutMs?: number;
  /** Injected for tests. */
  now?: () => number;
  setTimer?: (task: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export const DEFAULT_METRICS_MIN_INTERVAL_MS = 30_000;
export const DEFAULT_METRICS_IDLE_FLUSH_MS = 5_000;
export const DEFAULT_FLUSH_TIMEOUT_MS = 5_000;

export class ExportCoordinator {
  readonly #flushers: Flushers;
  readonly #metricsMinIntervalMs: number;
  readonly #metricsIdleFlushMs: number;
  readonly #flushTimeoutMs: number;
  readonly #now: () => number;
  readonly #setTimer: NonNullable<ExportCoordinatorOptions["setTimer"]>;
  readonly #clearTimer: NonNullable<ExportCoordinatorOptions["clearTimer"]>;

  #running: Promise<void> | null = null;
  #dirty = false;
  #lastMetricsFlushAt = Number.NEGATIVE_INFINITY;
  #idleTimer: TimerHandle;
  #stopped = false;

  constructor(options: ExportCoordinatorOptions) {
    this.#flushers = options.flushers;
    this.#metricsMinIntervalMs =
      options.metricsMinIntervalMs ?? DEFAULT_METRICS_MIN_INTERVAL_MS;
    this.#metricsIdleFlushMs =
      options.metricsIdleFlushMs ?? DEFAULT_METRICS_IDLE_FLUSH_MS;
    this.#flushTimeoutMs = options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
    this.#now = options.now ?? (() => Date.now());
    this.#setTimer =
      options.setTimer ?? ((task, ms) => setTimeout(task, ms) as TimerHandle);
    this.#clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  /** A request has just ended: send what is buffered, holding the function open if the platform allows. */
  requestEnded(waitUntil?: WaitUntil): void {
    if (this.#stopped) return;
    const flush = this.#schedule();
    try {
      waitUntil?.(flush);
    } catch {
      // See `wait-until.ts`.
    }
  }

  /** Sends everything now, ignoring the metrics interval. Used at shutdown and by tests. */
  async flushAll(): Promise<void> {
    await this.#run(this.#flushers, true);
  }

  stop(): void {
    this.#stopped = true;
    this.#cancelIdleTimer();
  }

  #schedule(): Promise<void> {
    if (this.#running) {
      this.#dirty = true;
      return this.#running;
    }
    this.#running = this.#cycle().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #cycle(): Promise<void> {
    // Let the span processors that run after this request's `onEnd` hand their
    // spans to their buffers first.
    await Promise.resolve();
    let sentMetrics = false;
    do {
      this.#dirty = false;
      const metricsDue =
        this.#now() - this.#lastMetricsFlushAt >= this.#metricsMinIntervalMs;
      await this.#run(this.#flushers, metricsDue);
      sentMetrics ||= metricsDue;
    } while (this.#dirty && !this.#stopped);
    if (!sentMetrics) this.#armIdleFlush();
  }

  async #run(flushers: Flushers, includeMetrics: boolean): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (flushers.traces) tasks.push(this.#guard(flushers.traces));
    if (flushers.logs) tasks.push(this.#guard(flushers.logs));
    if (includeMetrics && flushers.metrics) {
      this.#cancelIdleTimer();
      this.#lastMetricsFlushAt = this.#now();
      tasks.push(this.#guard(flushers.metrics));
    }
    if (tasks.length === 0) return;

    let timer: TimerHandle;
    const timeout = new Promise<void>((resolve) => {
      timer = this.#setTimer(resolve, this.#flushTimeoutMs);
      if (typeof timer === "object") timer?.unref?.();
    });
    try {
      await Promise.race([Promise.allSettled(tasks), timeout]);
    } finally {
      this.#clearTimer(timer);
    }
  }

  async #guard(flush: () => Promise<void>): Promise<void> {
    try {
      await flush();
    } catch {
      // Counted by the guarded exporters; see the note above.
    }
  }

  #armIdleFlush(): void {
    const flushMetrics = this.#flushers.metrics;
    if (this.#stopped || !flushMetrics) return;
    this.#cancelIdleTimer();
    const handle = this.#setTimer(() => {
      this.#idleTimer = undefined;
      if (this.#running) return;
      this.#lastMetricsFlushAt = this.#now();
      void this.#guard(flushMetrics);
    }, this.#metricsIdleFlushMs);
    // The timer must never be the reason a process stays alive.
    if (typeof handle === "object") handle?.unref?.();
    this.#idleTimer = handle;
  }

  #cancelIdleTimer(): void {
    if (this.#idleTimer !== undefined) {
      this.#clearTimer(this.#idleTimer);
      this.#idleTimer = undefined;
    }
  }
}
