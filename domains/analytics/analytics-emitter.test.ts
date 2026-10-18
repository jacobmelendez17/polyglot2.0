import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import type { AnalyticsProvider } from "@/providers/analytics/types";

const warn = vi.hoisted(() => vi.fn());
const resolveAnalyticsCaptureIdentity = vi.hoisted(() => vi.fn());
const findLanguageCode = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock("./analytics-consent-service", () => ({
  resolveAnalyticsCaptureIdentity,
}));
vi.mock("./analytics-language-repository", () => ({ findLanguageCode }));

import { emitAnalyticsEvents } from "./analytics-emitter";
import type { PendingAnalyticsEvent } from "./analytics-events";

const DB = { marker: "db" } as unknown as DbClient;
const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const OCCURRED_AT = new Date("2026-10-17T20:00:00Z");

function recordingProvider() {
  const calls: string[] = [];
  const provider = {
    capture: vi.fn(() => void calls.push("capture")),
    flush: vi.fn(async () => void calls.push("flush")),
    shutdown: vi.fn(async () => undefined),
  } satisfies AnalyticsProvider;
  return { provider, calls };
}

function deps(provider: AnalyticsProvider) {
  return { db: DB, provider, appEnvironment: "production" as const };
}

function pending(
  overrides: Partial<PendingAnalyticsEvent> = {},
): PendingAnalyticsEvent {
  return {
    event: "lesson_started",
    languageId: "language-1",
    properties: { session_key: SESSION },
    dedupeKey: `lesson_started:${SESSION}`,
    occurredAt: OCCURRED_AT,
    source: "browser_intent",
    ...overrides,
  };
}

beforeEach(() => {
  warn.mockReset();
  resolveAnalyticsCaptureIdentity.mockReset();
  findLanguageCode.mockReset();
  resolveAnalyticsCaptureIdentity.mockResolvedValue({
    distinctId: "analytics-id-1",
  });
  findLanguageCode.mockResolvedValue("es-MX");
});

describe("emitAnalyticsEvents", () => {
  it("does nothing, and asks nothing, when there is nothing to send", async () => {
    const { provider } = recordingProvider();

    await expect(
      emitAnalyticsEvents(deps(provider), { userId: "user-1", events: [] }),
    ).resolves.toEqual({ captured: 0, dropped: 0 });

    expect(resolveAnalyticsCaptureIdentity).not.toHaveBeenCalled();
    expect(provider.capture).not.toHaveBeenCalled();
    expect(provider.flush).not.toHaveBeenCalled();
  });

  it("asks the capture gate about this account, against the real database, before anything else", async () => {
    const { provider } = recordingProvider();

    await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [pending()],
    });

    expect(resolveAnalyticsCaptureIdentity).toHaveBeenCalledWith(DB, "user-1");
  });

  it("sends nothing for a learner who is not consenting, and says nothing about it", async () => {
    resolveAnalyticsCaptureIdentity.mockResolvedValue(null);
    const { provider } = recordingProvider();

    const outcome = await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [pending(), pending({ dedupeKey: "other" })],
    });

    expect(outcome).toEqual({ captured: 0, dropped: 2 });
    expect(findLanguageCode).not.toHaveBeenCalled();
    expect(provider.capture).not.toHaveBeenCalled();
    expect(provider.flush).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("captures each valid event under the pseudonym, with the catalog's properties plus the common ones, and nothing else", async () => {
    const { provider } = recordingProvider();

    const outcome = await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [
        pending(),
        pending({
          event: "level_unlocked",
          properties: { level: 4 },
          dedupeKey: "level_unlocked:level-4",
          source: "server",
        }),
      ],
    });

    expect(outcome).toEqual({ captured: 2, dropped: 0 });
    expect(provider.capture).toHaveBeenNthCalledWith(1, {
      event: "lesson_started",
      distinctId: "analytics-id-1",
      properties: {
        language: "es-MX",
        app_environment: "production",
        event_schema_version: 1,
        source: "browser_intent",
        session_key: SESSION,
      },
      dedupeKey: `lesson_started:${SESSION}`,
      occurredAt: OCCURRED_AT,
    });
    expect(provider.capture).toHaveBeenNthCalledWith(2, {
      event: "level_unlocked",
      distinctId: "analytics-id-1",
      properties: {
        language: "es-MX",
        app_environment: "production",
        event_schema_version: 1,
        source: "server",
        level: 4,
      },
      dedupeKey: "level_unlocked:level-4",
      occurredAt: OCCURRED_AT,
    });
    // Never the Polyglot account id, whatever else is true.
    expect(JSON.stringify(provider.capture.mock.calls)).not.toContain("user-1");
  });

  it("delivers once, after every capture, and waits for it", async () => {
    const { provider, calls } = recordingProvider();
    let delivered = false;
    provider.flush.mockImplementation(async () => {
      calls.push("flush");
      await new Promise((resolve) => setTimeout(resolve, 10));
      delivered = true;
    });

    await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [pending(), pending({ dedupeKey: "second" })],
    });

    expect(calls).toEqual(["capture", "capture", "flush"]);
    expect(delivered).toBe(true);
  });

  it("drops an event whose language cannot be found and still sends the rest", async () => {
    findLanguageCode.mockImplementation(async (_db: unknown, id: string) =>
      id === "language-1" ? "es-MX" : null,
    );
    const { provider } = recordingProvider();

    const outcome = await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [
        pending({ languageId: "deleted-language", dedupeKey: "gone" }),
        pending(),
      ],
    });

    expect(outcome).toEqual({ captured: 1, dropped: 1 });
    expect(provider.capture).toHaveBeenCalledTimes(1);
    expect(provider.flush).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({
      event: "analytics.event.dropped",
      analyticsEvent: "lesson_started",
      reason: "unknown_language",
    });
  });

  it("drops an event that breaks the catalog, naming the property path and never the value", async () => {
    const { provider } = recordingProvider();

    const outcome = await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [
        pending({
          event: "lesson_completed",
          properties: {
            session_key: SESSION,
            item_count: 3,
            accuracy_percent: 9999,
            level: 2,
            answer: "hunter2",
          } as never,
          dedupeKey: "lesson_completed:bad",
          source: "server",
        }),
        pending(),
      ],
    });

    expect(outcome).toEqual({ captured: 1, dropped: 1 });
    expect(provider.capture).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    const [logged] = warn.mock.calls[0]!;
    expect(logged).toMatchObject({
      event: "analytics.event.dropped",
      analyticsEvent: "lesson_completed",
      reason: "invalid_properties",
    });
    expect(logged.paths).toContain("accuracy_percent");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("hunter2");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("9999");
  });

  it("drops an event whose language code is not a language code", async () => {
    findLanguageCode.mockResolvedValue("not a language!");
    const { provider } = recordingProvider();

    const outcome = await emitAnalyticsEvents(deps(provider), {
      userId: "user-1",
      events: [pending()],
    });

    expect(outcome).toEqual({ captured: 0, dropped: 1 });
    expect(provider.capture).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "invalid_context" }),
    );
  });

  describe("never throws — telemetry may be lost, the learner's result is untouched", () => {
    const SECRET = "postgres://user:secret@host/db";

    it("when the consent lookup fails", async () => {
      resolveAnalyticsCaptureIdentity.mockRejectedValue(new Error(SECRET));
      const { provider } = recordingProvider();

      await expect(
        emitAnalyticsEvents(deps(provider), {
          userId: "user-1",
          events: [pending()],
        }),
      ).resolves.toEqual({ captured: 0, dropped: 1 });

      expect(provider.capture).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith({
        event: "analytics.emission.failed",
        reason: "unexpected",
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
    });

    it("when the language lookup fails", async () => {
      findLanguageCode.mockRejectedValue(new Error(SECRET));
      const { provider } = recordingProvider();

      await expect(
        emitAnalyticsEvents(deps(provider), {
          userId: "user-1",
          events: [pending()],
        }),
      ).resolves.toEqual({ captured: 0, dropped: 1 });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
    });

    it("when the provider throws on capture", async () => {
      const { provider } = recordingProvider();
      provider.capture.mockImplementation(() => {
        throw new Error(SECRET);
      });

      await expect(
        emitAnalyticsEvents(deps(provider), {
          userId: "user-1",
          events: [pending()],
        }),
      ).resolves.toEqual({ captured: 0, dropped: 1 });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
    });

    it("when delivery rejects", async () => {
      const { provider } = recordingProvider();
      provider.flush.mockRejectedValue(new Error(SECRET));

      await expect(
        emitAnalyticsEvents(deps(provider), {
          userId: "user-1",
          events: [pending()],
        }),
      ).resolves.toEqual({ captured: 0, dropped: 1 });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
    });
  });
});
