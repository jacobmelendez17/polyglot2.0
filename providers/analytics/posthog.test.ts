import { inspect } from "node:util";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  POSTHOG_DEFAULT_MAX_QUEUED,
  POSTHOG_DEFAULT_TIMEOUT_MS,
  PostHogAnalyticsProvider,
  deterministicEventUuid,
} from "./posthog";

// Assembled at run time so no literal here resembles a real PostHog token.
const TOKEN = ["phc", "x".repeat(40)].join("_");
const HOST = "https://us.i.posthog.com";
const DISTINCT_ID = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Call = { url: string; init: RequestInit };

function recordingFetch(respond: () => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const ok = () => new Response("{}", { status: 200 });

function provider(
  fetchImpl: typeof fetch,
  options: { host?: string; timeoutMs?: number; maxQueued?: number } = {},
) {
  return new PostHogAnalyticsProvider({
    host: options.host ?? HOST,
    projectToken: TOKEN,
    fetch: fetchImpl,
    timeoutMs: options.timeoutMs,
    maxQueued: options.maxQueued,
  });
}

const bodyOf = (call: Call) => JSON.parse(call.init.body as string);

beforeEach(() => warn.mockClear());

describe("PostHogAnalyticsProvider — what it sends", () => {
  it("sends everything queued as one POST to the batch endpoint of its own host", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);

    posthog.capture({ event: "lesson_completed", distinctId: DISTINCT_ID });
    posthog.capture({ event: "level_unlocked", distinctId: DISTINCT_ID });
    await posthog.flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://us.i.posthog.com/batch/");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.headers).toEqual({
      "content-type": "application/json",
    });
    const body = bodyOf(calls[0]!);
    expect(body.api_key).toBe(TOKEN);
    expect(body.batch.map((event: { event: string }) => event.event)).toEqual([
      "lesson_completed",
      "level_unlocked",
    ]);
  });

  it("files each event under the pseudonym, as an anonymous event with GeoIP off", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);

    posthog.capture({
      event: "lesson_completed",
      distinctId: DISTINCT_ID,
      properties: { item_count: 6, accuracy_percent: 83 },
      occurredAt: new Date("2026-10-17T20:00:00.000Z"),
      dedupeKey: "lesson_completed:abc",
    });
    await posthog.flush();

    const [event] = bodyOf(calls[0]!).batch;
    expect(event).toEqual({
      event: "lesson_completed",
      distinct_id: DISTINCT_ID,
      properties: {
        item_count: 6,
        accuracy_percent: 83,
        distinct_id: DISTINCT_ID,
        $process_person_profile: false,
        $geoip_disable: true,
        $lib: "polyglot-server",
      },
      timestamp: "2026-10-17T20:00:00.000Z",
      uuid: deterministicEventUuid(DISTINCT_ID, "lesson_completed:abc"),
    });
  });

  it("never lets a caller's properties switch off the privacy settings", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);

    posthog.capture({
      event: "x",
      distinctId: DISTINCT_ID,
      properties: {
        $geoip_disable: false,
        $process_person_profile: true,
        distinct_id: "someone-else",
      },
    });
    await posthog.flush();

    const [event] = bodyOf(calls[0]!).batch;
    expect(event.properties.$geoip_disable).toBe(true);
    expect(event.properties.$process_person_profile).toBe(false);
    expect(event.properties.distinct_id).toBe(DISTINCT_ID);
  });

  it("stamps the time the event happened, not the time it was sent", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);
    const happened = new Date("2020-01-02T03:04:05.678Z");

    posthog.capture({
      event: "x",
      distinctId: DISTINCT_ID,
      occurredAt: happened,
    });
    await posthog.flush();

    expect(bodyOf(calls[0]!).batch[0].timestamp).toBe(happened.toISOString());
  });

  it("tolerates a trailing slash on the host", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl, { host: "https://eu.i.posthog.com/" });

    posthog.capture({ event: "x", distinctId: DISTINCT_ID });
    await posthog.flush();

    expect(calls[0]!.url).toBe("https://eu.i.posthog.com/batch/");
  });

  it("makes no request at all when nothing was captured", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);

    await provider(fetchImpl).flush();

    expect(calls).toEqual([]);
  });

  it("sends an event once: a second flush finds the queue empty", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);

    posthog.capture({ event: "x", distinctId: DISTINCT_ID });
    await Promise.all([posthog.flush(), posthog.flush()]);
    await posthog.flush();

    expect(calls).toHaveLength(1);
    expect(bodyOf(calls[0]!).batch).toHaveLength(1);
  });

  it("flushes on shutdown too", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);

    posthog.capture({ event: "x", distinctId: DISTINCT_ID });
    await posthog.shutdown();

    expect(calls).toHaveLength(1);
  });
});

describe("deterministicEventUuid", () => {
  it("gives the same id for the same learner and key, so a replay is the same event", () => {
    expect(deterministicEventUuid(DISTINCT_ID, "lesson_completed:1")).toBe(
      deterministicEventUuid(DISTINCT_ID, "lesson_completed:1"),
    );
  });

  it("gives a different id for a different key or a different learner", () => {
    const base = deterministicEventUuid(DISTINCT_ID, "lesson_completed:1");
    expect(deterministicEventUuid(DISTINCT_ID, "lesson_completed:2")).not.toBe(
      base,
    );
    expect(
      deterministicEventUuid("someone-else", "lesson_completed:1"),
    ).not.toBe(base);
  });

  it("is a well-formed UUID", () => {
    expect(deterministicEventUuid(DISTINCT_ID, "k")).toMatch(UUID);
  });

  it("does not run the learner and key together ambiguously", () => {
    expect(deterministicEventUuid("ab", "c")).not.toBe(
      deterministicEventUuid("a", "bc"),
    );
  });

  it("is random when there is no key", () => {
    expect(deterministicEventUuid(DISTINCT_ID, undefined)).not.toBe(
      deterministicEventUuid(DISTINCT_ID, undefined),
    );
  });
});

describe("PostHogAnalyticsProvider — when delivery fails, it drops rather than retries", () => {
  it("makes exactly one request on an HTTP error, drops the batch, and logs the status and nothing else", async () => {
    const { calls, fetchImpl } = recordingFetch(
      () => new Response("secret vendor body " + TOKEN, { status: 500 }),
    );
    const posthog = provider(fetchImpl);

    posthog.capture({ event: "x", distinctId: DISTINCT_ID });
    posthog.capture({ event: "y", distinctId: DISTINCT_ID });
    await posthog.flush();
    await posthog.flush();

    expect(calls).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      event: "analytics.posthog.send_failed",
      reason: "http_error",
      status: 500,
      dropped: 2,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret vendor body");
  });

  it("makes exactly one request when the network fails, and resolves", async () => {
    const { calls, fetchImpl } = recordingFetch(() => {
      throw new TypeError("fetch failed: ECONNREFUSED us.i.posthog.com");
    });
    const posthog = provider(fetchImpl);

    posthog.capture({ event: "x", distinctId: DISTINCT_ID });
    await expect(posthog.flush()).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith({
      event: "analytics.posthog.send_failed",
      reason: "network_error",
      dropped: 1,
    });
    // The error's own text — which names a host and a refused connection — is not logged.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("ECONNREFUSED");
  });

  it("gives up after its timeout instead of holding the function open, and does not retry", async () => {
    const calls: Call[] = [];
    const hangingFetch = ((url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason),
        );
      });
    }) as unknown as typeof fetch;
    const posthog = provider(hangingFetch, { timeoutMs: 25 });

    posthog.capture({ event: "x", distinctId: DISTINCT_ID });
    const started = Date.now();
    await posthog.flush();

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(calls).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith({
      event: "analytics.posthog.send_failed",
      reason: "timeout",
      dropped: 1,
    });
  });

  it("resolves even if the batch cannot be serialized", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl);

    posthog.capture({
      event: "x",
      distinctId: DISTINCT_ID,
      // JSON cannot hold a BigInt: serialization throws inside flush.
      properties: { n: BigInt(1) as unknown as number },
    });

    await expect(posthog.flush()).resolves.toBeUndefined();
    expect(calls).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("holds a bounded queue: events over the limit are dropped and counted, not stored", async () => {
    const { calls, fetchImpl } = recordingFetch(ok);
    const posthog = provider(fetchImpl, { maxQueued: 2 });

    for (const event of ["a", "b", "c", "d"]) {
      posthog.capture({ event, distinctId: DISTINCT_ID });
    }
    await posthog.flush();

    expect(
      bodyOf(calls[0]!).batch.map((e: { event: string }) => e.event),
    ).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledWith({
      event: "analytics.posthog.queue_full",
      dropped: 2,
    });
  });

  it("has sensible built-in bounds", () => {
    expect(POSTHOG_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
    expect(POSTHOG_DEFAULT_MAX_QUEUED).toBeLessThanOrEqual(100);
  });

  it("never throws from capture", () => {
    const posthog = provider(recordingFetch(ok).fetchImpl);
    const hostile = {
      get event(): string {
        throw new Error("boom");
      },
      distinctId: DISTINCT_ID,
    };

    expect(() => posthog.capture(hostile as never)).not.toThrow();
  });
});

describe("PostHogAnalyticsProvider — it keeps what it holds to itself", () => {
  it("does not show its token or host when serialized, inspected or converted to text", () => {
    const posthog = provider(recordingFetch(ok).fetchImpl);

    for (const rendered of [
      JSON.stringify(posthog),
      inspect(posthog, { depth: null }),
      String(posthog),
      JSON.stringify({ posthog }),
    ]) {
      expect(rendered).not.toContain(TOKEN);
      expect(rendered).not.toContain("posthog.com");
    }
  });

  it("never writes the token to a log, whatever goes wrong", async () => {
    for (const failure of [
      () => new Response("", { status: 401 }),
      () => {
        throw new Error(`could not reach host with key ${TOKEN}`);
      },
    ]) {
      const posthog = provider(recordingFetch(failure).fetchImpl);
      posthog.capture({ event: "x", distinctId: DISTINCT_ID });
      await posthog.flush();
    }

    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
  });
});
