/**
 * Spec 27 Unit 27.5/27.6 — which telemetry signals are actually running in this
 * server process.
 *
 * `instrumentation.ts` starts the OpenTelemetry SDK in its own bundle, apart
 * from the route and action bundles that run the application. Anything both
 * sides must agree on therefore cannot live in a module variable — the two
 * sides may each get their own copy of the module — so it lives on `globalThis`
 * under a registered symbol, the same mechanism OpenTelemetry's own API uses
 * to share its providers.
 *
 * The application-side bridges ask here first, so while no signal is enabled
 * (the default, and every test) they do exactly what they did before spec 27:
 * no span, no metric, no log record, no extra work.
 */

export type ActiveSignals = {
  readonly metrics: boolean;
  readonly traces: boolean;
  readonly logs: boolean;
};

const KEY = Symbol.for("polyglot.observability.active");

const NONE: ActiveSignals = { metrics: false, traces: false, logs: false };

type Holder = { [KEY]?: ActiveSignals };

export function getActiveSignals(): ActiveSignals {
  return (globalThis as Holder)[KEY] ?? NONE;
}

export function setActiveSignals(signals: ActiveSignals): void {
  (globalThis as Holder)[KEY] = signals;
}

export function clearActiveSignals(): void {
  delete (globalThis as Holder)[KEY];
}

export function anySignalActive(): boolean {
  const signals = getActiveSignals();
  return signals.metrics || signals.traces || signals.logs;
}
