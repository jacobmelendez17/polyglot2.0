/**
 * The product-analytics provider boundary (spec 27 §4, architecture.md's
 * `analytics` domain). Domain and application code describe what happened in
 * these terms and never import a vendor SDK, so PostHog can be replaced — or
 * switched off — without touching a learning rule.
 *
 * The typed event catalog (names, per-event property schemas, the consent
 * gate) is Unit 27.3 and lives in `domains/analytics`; this boundary only
 * carries an already-validated event to a vendor.
 */

export type AnalyticsProperties = Readonly<
  Record<string, string | number | boolean | null>
>;

export type AnalyticsCaptureInput = {
  /** A snake_case name from the typed event catalog. */
  event: string;
  /** The analytics-only pseudonymous id (spec 27 §5.3) — never a Clerk id, an email or a Polyglot user id. */
  distinctId: string;
  properties?: AnalyticsProperties;
  /** The same logical event carries the same key, so a vendor that supports it can drop a replay (spec 27 §6.3). */
  dedupeKey?: string;
  /** When it happened, as opposed to when it was sent: events are delivered after the response, a little later. */
  occurredAt?: Date;
};

export interface AnalyticsProvider {
  /**
   * Queues an event. Never throws and never waits on the network: the learner's
   * response must not depend on analytics (architecture.md, "Graceful
   * Degradation").
   */
  capture(input: AnalyticsCaptureInput): void;
  /** Delivers whatever is queued. Resolves even when delivery fails — telemetry may be dropped, never retried into a storm. */
  flush(): Promise<void>;
  /** Flushes, then stops the provider for good. Resolves even when delivery fails. */
  shutdown(): Promise<void>;
}
