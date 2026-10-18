/**
 * Spec 27 Units 27.5–27.6 — Next.js calls `register` once when a server
 * instance starts, before it handles a request.
 *
 * The OpenTelemetry SDK is Node-only, so it is imported only for the Node.js
 * runtime (the Edge runtime has no use for it here), and only on demand — an
 * installation with every Grafana signal off never loads it.
 * `bootObservability` starts whichever signals the settings enable and never
 * throws: optional telemetry must not be able to stop the application from
 * starting.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { bootObservability } =
      await import("./providers/observability/boot");
    await bootObservability();
  } catch {
    // See above.
  }
}
