import { createHash, randomUUID } from "node:crypto";

import { logger } from "@/lib/logging/logger";

import type { AnalyticsCaptureInput, AnalyticsProvider } from "./types";

/**
 * Spec 27 Unit 27.3 — the PostHog adapter: a small client for PostHog's
 * documented batch capture endpoint (`POST {host}/batch/`), not the
 * `posthog-node` SDK. The reason is what spec 27 asks of delivery:
 *
 * - **bounded** — one request per flush, a hard timeout, a capped queue, and no
 *   retries, so an outage or a reached Free quota drops events instead of
 *   becoming a retry storm or a bill (§3.3, §14);
 * - **serverless-honest** — no background timers and nothing that outlives a
 *   call: events leave only when `flush()` is awaited, which the emitter does
 *   inside Next's `after()`, because a function can be frozen the moment its
 *   response is sent (§6.3);
 * - **private by construction** — every event is sent as an anonymous event
 *   (`$process_person_profile: false`, so no person record or profile
 *   properties) with GeoIP enrichment off (`$geoip_disable`), under the random
 *   pseudonym and nothing else (§5.3, §6.2).
 *
 * It uses only `fetch`, so `providers/test-support/outbound-network-guard`
 * sees every byte it would send, and there is no new dependency to audit.
 * Swapping in the SDK later means replacing this one file.
 *
 * The project token and the host are held in private fields, so logging or
 * serializing a provider object cannot reveal them.
 */

export type PostHogProviderOptions = {
  /** A validated PostHog Cloud ingestion origin, e.g. https://us.i.posthog.com */
  host: string;
  /** The public project token (`phc_…`). */
  projectToken: string;
  /** Injected for tests. */
  fetch?: typeof fetch;
  /** Hard ceiling on one request, so a slow PostHog cannot hold the function open. */
  timeoutMs?: number;
  /** Events held between flushes; beyond this, new events are dropped rather than queued without bound. */
  maxQueued?: number;
};

export const POSTHOG_DEFAULT_TIMEOUT_MS = 3_000;
export const POSTHOG_DEFAULT_MAX_QUEUED = 50;

type PostHogEvent = {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
  uuid: string;
};

/**
 * A stable UUID for one logical event: the same learner and the same dedupe key
 * always give the same id, so a replay of a completion is the same event to
 * PostHog (best effort — spec 27 §6.3 does not promise exactly-once). A name-based
 * (version 5 shaped) UUID built from a hash; no key means a random one.
 */
export function deterministicEventUuid(
  distinctId: string,
  dedupeKey: string | undefined,
): string {
  if (!dedupeKey) return randomUUID();
  const bytes = createHash("sha256")
    .update(`${distinctId}\u0000${dedupeKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export class PostHogAnalyticsProvider implements AnalyticsProvider {
  readonly #endpoint: string;
  readonly #projectToken: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxQueued: number;
  #queue: PostHogEvent[] = [];
  #dropped = 0;

  constructor(options: PostHogProviderOptions) {
    this.#endpoint = `${options.host.replace(/\/+$/, "")}/batch/`;
    this.#projectToken = options.projectToken;
    this.#fetch = options.fetch ?? ((...args) => fetch(...args));
    this.#timeoutMs = options.timeoutMs ?? POSTHOG_DEFAULT_TIMEOUT_MS;
    this.#maxQueued = options.maxQueued ?? POSTHOG_DEFAULT_MAX_QUEUED;
  }

  capture(input: AnalyticsCaptureInput): void {
    try {
      if (this.#queue.length >= this.#maxQueued) {
        this.#dropped += 1;
        return;
      }
      this.#queue.push({
        event: input.event,
        distinct_id: input.distinctId,
        properties: {
          ...input.properties,
          distinct_id: input.distinctId,
          // No person profile, no GeoIP: events are filed under the pseudonym
          // and the properties the catalog allows, and PostHog derives nothing
          // about a place or a person from them.
          $process_person_profile: false,
          $geoip_disable: true,
          $lib: "polyglot-server",
        },
        timestamp: (input.occurredAt ?? new Date()).toISOString(),
        uuid: deterministicEventUuid(input.distinctId, input.dedupeKey),
      });
    } catch {
      // Queueing must never be able to fail the caller.
    }
  }

  async flush(): Promise<void> {
    const batch = this.#queue;
    this.#queue = [];
    const dropped = this.#dropped;
    this.#dropped = 0;

    if (dropped > 0) {
      logger.warn({ event: "analytics.posthog.queue_full", dropped });
    }
    if (batch.length === 0) return;

    try {
      const response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: this.#projectToken, batch }),
        signal: AbortSignal.timeout(this.#timeoutMs),
        cache: "no-store",
      });
      if (!response.ok) {
        // Status only — never the body, which is the vendor's to word.
        logger.warn({
          event: "analytics.posthog.send_failed",
          reason: "http_error",
          status: response.status,
          dropped: batch.length,
        });
      }
    } catch (error) {
      logger.warn({
        event: "analytics.posthog.send_failed",
        reason:
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError")
            ? "timeout"
            : "network_error",
        dropped: batch.length,
      });
    }
    // Whatever happened, the batch is gone: a failed delivery is dropped, never
    // retried, so an outage can neither pile up memory nor hammer the vendor.
  }

  async shutdown(): Promise<void> {
    await this.flush();
  }
}
