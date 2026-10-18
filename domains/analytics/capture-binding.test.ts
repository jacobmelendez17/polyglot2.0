import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors/app-error";

const fakeDb = vi.hoisted(() => ({ marker: "the real db" }));
const fakeProvider = vi.hoisted(() => ({ marker: "the analytics provider" }));
const getAnalyticsProvider = vi.hoisted(() => vi.fn(() => fakeProvider));
const telemetry = vi.hoisted(() => ({
  analytics: { state: "enabled" } as { state: string },
}));
const check = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
const resolveAnalyticsCaptureIdentity = vi.hoisted(() => vi.fn());
const emitAnalyticsEvents = vi.hoisted(() => vi.fn());
const runAfterResponse = vi.hoisted(() => vi.fn());

vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/lib/env", () => ({
  env: { APP_ENV: "production" },
  telemetryConfig: telemetry,
}));
vi.mock("@/lib/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock("@/providers/analytics", () => ({ getAnalyticsProvider }));
vi.mock("@/providers/rate-limit", () => ({
  getRateLimiter: () => ({ check }),
}));
vi.mock("./analytics-consent-service", () => ({
  resolveAnalyticsCaptureIdentity,
}));
vi.mock("./analytics-emitter", () => ({ emitAnalyticsEvents }));
vi.mock("./after-response", () => ({ runAfterResponse }));

import { queueAnalyticsEvent } from "./analytics-event-collector";
import type { PendingAnalyticsEvent } from "./analytics-events";
import {
  captureAnalyticsIntent,
  runWithAnalytics,
  scheduleAnalyticsEmission,
  shouldReportAnalyticsIntents,
} from "./capture-binding";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";

function pending(dedupeKey = "level_unlocked:1"): PendingAnalyticsEvent {
  return {
    event: "level_unlocked",
    languageId: "language-1",
    properties: { level: 2 },
    dedupeKey,
    occurredAt: new Date("2026-10-17T20:00:00Z"),
    source: "server",
  };
}

/** What was scheduled after the response, oldest first. */
const scheduledTasks = () =>
  runAfterResponse.mock.calls.map((call) => call[0] as () => Promise<void>);

beforeEach(() => {
  telemetry.analytics = { state: "enabled" };
  getAnalyticsProvider.mockReset();
  getAnalyticsProvider.mockImplementation(() => fakeProvider);
  check.mockReset();
  warn.mockReset();
  resolveAnalyticsCaptureIdentity.mockReset();
  emitAnalyticsEvents.mockReset();
  runAfterResponse.mockReset();
  check.mockResolvedValue({ allowed: true });
  emitAnalyticsEvents.mockResolvedValue({ captured: 1, dropped: 0 });
});

describe.each(["disabled", "blocked"])(
  "when analytics is %s",
  (state: string) => {
    beforeEach(() => {
      telemetry.analytics = { state };
    });

    it("schedules nothing, whatever it is handed", () => {
      scheduleAnalyticsEmission("user-1", [pending()]);
      expect(runAfterResponse).not.toHaveBeenCalled();
    });

    it("runs the work and returns its result untouched, collecting nothing", async () => {
      const result = { lesson: "done" };
      const work = vi.fn(async () => {
        queueAnalyticsEvent(pending());
        return result;
      });

      await expect(runWithAnalytics({ userId: "user-1" }, work)).resolves.toBe(
        result,
      );

      expect(work).toHaveBeenCalledTimes(1);
      expect(runAfterResponse).not.toHaveBeenCalled();
    });

    it("never asks the database about consent, so the page pays nothing", async () => {
      await expect(shouldReportAnalyticsIntents("user-1")).resolves.toBe(false);
      expect(resolveAnalyticsCaptureIdentity).not.toHaveBeenCalled();
    });

    it("accepts an intent report without spending the rate limit or scheduling anything", async () => {
      await expect(
        captureAnalyticsIntent({
          userId: "user-1",
          languageId: "language-1",
          intent: { event: "onboarding_started" },
        }),
      ).resolves.toBeUndefined();

      expect(check).not.toHaveBeenCalled();
      expect(runAfterResponse).not.toHaveBeenCalled();
    });
  },
);

describe("a configuration problem", () => {
  it("is reported when analytics is blocked, by resolving the provider, and still sends and schedules nothing", async () => {
    telemetry.analytics = { state: "blocked" };

    scheduleAnalyticsEmission("user-1", [pending()]);
    await runWithAnalytics({ userId: "user-1" }, async () => {
      queueAnalyticsEvent(pending());
    });
    await shouldReportAnalyticsIntents("user-1");

    expect(getAnalyticsProvider).toHaveBeenCalled();
    expect(runAfterResponse).not.toHaveBeenCalled();
    expect(emitAnalyticsEvents).not.toHaveBeenCalled();
  });

  it("is not looked for when analytics is simply switched off", async () => {
    telemetry.analytics = { state: "disabled" };

    scheduleAnalyticsEmission("user-1", [pending()]);
    await runWithAnalytics({ userId: "user-1" }, async () => undefined);
    await shouldReportAnalyticsIntents("user-1");

    expect(getAnalyticsProvider).not.toHaveBeenCalled();
  });
});

describe("scheduleAnalyticsEmission", () => {
  it("does not schedule an empty emission", () => {
    scheduleAnalyticsEmission("user-1", []);
    expect(runAfterResponse).not.toHaveBeenCalled();
  });

  it("schedules one task that emits for that account with the real database, provider and environment", async () => {
    const events = [pending("a"), pending("b")];

    scheduleAnalyticsEmission("user-1", events);

    expect(runAfterResponse).toHaveBeenCalledTimes(1);
    // Nothing is sent until the response is out: scheduling alone emits nothing.
    expect(emitAnalyticsEvents).not.toHaveBeenCalled();

    await scheduledTasks()[0]!();

    expect(emitAnalyticsEvents).toHaveBeenCalledTimes(1);
    expect(emitAnalyticsEvents).toHaveBeenCalledWith(
      { db: fakeDb, provider: fakeProvider, appEnvironment: "production" },
      { userId: "user-1", events },
    );
  });
});

describe("scheduleAnalyticsEmission cannot fail its caller", () => {
  it("swallows a scheduling failure, and warns without quoting it", () => {
    runAfterResponse.mockImplementation(() => {
      throw new Error("postgres://user:secret@host/db");
    });

    expect(() =>
      scheduleAnalyticsEmission("user-1", [pending()]),
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith({
      event: "analytics.emission.failed",
      reason: "schedule",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
  });

  it("swallows a failure to resolve the provider's state", () => {
    getAnalyticsProvider.mockImplementation(() => {
      throw new Error("no provider");
    });
    telemetry.analytics = { state: "blocked" };

    expect(() =>
      scheduleAnalyticsEmission("user-1", [pending()]),
    ).not.toThrow();
  });
});

describe("runWithAnalytics", () => {
  it("returns the work's result untouched and emits what the work queued, for the acting account", async () => {
    const result = { items: [{ id: "x" }] };

    const returned = await runWithAnalytics({ userId: "user-1" }, async () => {
      queueAnalyticsEvent(pending("a"));
      await Promise.resolve();
      queueAnalyticsEvent(pending("b"));
      return result;
    });

    expect(returned).toBe(result);
    expect(runAfterResponse).toHaveBeenCalledTimes(1);
    await scheduledTasks()[0]!();
    expect(emitAnalyticsEvents).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      events: [pending("a"), pending("b")],
    });
  });

  it("schedules nothing when the work queued nothing — a replay or a plain read", async () => {
    await runWithAnalytics({ userId: "user-1" }, async () => "no events");
    expect(runAfterResponse).not.toHaveBeenCalled();
  });

  it("schedules nothing, and rethrows, when the work throws — a rolled-back call reports nothing", async () => {
    const refused = new AppError("RATE_LIMITED", "Slow down.");

    await expect(
      runWithAnalytics({ userId: "user-1" }, async () => {
        queueAnalyticsEvent(pending("rolled-back"));
        throw refused;
      }),
    ).rejects.toBe(refused);

    expect(runAfterResponse).not.toHaveBeenCalled();
  });

  it("emits nothing on its own: the result is returned before any delivery is attempted", async () => {
    await runWithAnalytics({ userId: "user-1" }, async () => {
      queueAnalyticsEvent(pending());
    });

    expect(emitAnalyticsEvents).not.toHaveBeenCalled();
  });
});

describe("shouldReportAnalyticsIntents", () => {
  it("is true only for a learner who currently consents, asking the database each time", async () => {
    resolveAnalyticsCaptureIdentity.mockResolvedValueOnce({
      distinctId: "analytics-1",
    });
    await expect(shouldReportAnalyticsIntents("user-1")).resolves.toBe(true);
    expect(resolveAnalyticsCaptureIdentity).toHaveBeenCalledWith(
      fakeDb,
      "user-1",
    );

    resolveAnalyticsCaptureIdentity.mockResolvedValueOnce(null);
    await expect(shouldReportAnalyticsIntents("user-1")).resolves.toBe(false);
    expect(resolveAnalyticsCaptureIdentity).toHaveBeenCalledTimes(2);
  });

  it("answers no, and warns without naming anyone, when the consent read fails — the page must still render", async () => {
    resolveAnalyticsCaptureIdentity.mockRejectedValue(
      new Error("connection refused: postgres://user:secret@host/db"),
    );

    await expect(shouldReportAnalyticsIntents("user-1")).resolves.toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("analytics.intent.check_failed");
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("user-1");
  });
});

describe("captureAnalyticsIntent", () => {
  it("spends the intent rate limit for this account before doing anything else", async () => {
    await captureAnalyticsIntent({
      userId: "user-1",
      languageId: "language-1",
      intent: { event: "onboarding_started" },
    });

    expect(check).toHaveBeenCalledWith({
      policy: "analytics-intent",
      subject: "user-1",
    });
  });

  it("refuses, and schedules nothing, once the limit is spent", async () => {
    check.mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });

    const failure = await captureAnalyticsIntent({
      userId: "user-1",
      languageId: "language-1",
      intent: { event: "lesson_started", sessionKey: SESSION },
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: "RATE_LIMITED" });
    expect((failure as AppError).message).toContain("12s");
    expect(runAfterResponse).not.toHaveBeenCalled();
  });

  it("schedules onboarding_started as a once-per-account milestone from the browser", async () => {
    await captureAnalyticsIntent({
      userId: "user-1",
      languageId: "language-1",
      intent: { event: "onboarding_started" },
    });

    await scheduledTasks()[0]!();
    const [, { userId, events }] = emitAnalyticsEvents.mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(events).toEqual([
      {
        event: "onboarding_started",
        languageId: "language-1",
        properties: {},
        dedupeKey: "onboarding_started",
        occurredAt: expect.any(Date),
        source: "browser_intent",
      },
    ]);
  });

  it.each(["lesson_started", "review_session_started"] as const)(
    "schedules %s keyed by the session, carrying only the session's own id",
    async (event) => {
      await captureAnalyticsIntent({
        userId: "user-1",
        languageId: "language-1",
        intent: { event, sessionKey: SESSION },
      });

      await scheduledTasks()[0]!();
      const [, { events }] = emitAnalyticsEvents.mock.calls[0]!;
      expect(events).toEqual([
        {
          event,
          languageId: "language-1",
          properties: { session_key: SESSION },
          dedupeKey: `${event}:${SESSION}`,
          occurredAt: expect.any(Date),
          source: "browser_intent",
        },
      ]);
    },
  );

  it("builds the event from the named fields only, so nothing extra a client sent can ride along", async () => {
    await captureAnalyticsIntent({
      userId: "user-1",
      languageId: "language-1",
      intent: {
        event: "lesson_started",
        sessionKey: SESSION,
        answer: "hunter2",
        email: "someone@example.com",
        count: 40,
      } as never,
    });

    await scheduledTasks()[0]!();
    const [, { events }] = emitAnalyticsEvents.mock.calls[0]!;
    expect(Object.keys(events[0].properties)).toEqual(["session_key"]);
    expect(JSON.stringify(events)).not.toContain("hunter2");
    expect(JSON.stringify(events)).not.toContain("someone@example.com");
  });

  it("stamps the event when it was reported, not a time the client supplied", async () => {
    const before = Date.now();
    await captureAnalyticsIntent({
      userId: "user-1",
      languageId: "language-1",
      intent: { event: "onboarding_started" },
    });
    const after = Date.now();

    await scheduledTasks()[0]!();
    const [, { events }] = emitAnalyticsEvents.mock.calls[0]!;
    expect(events[0].occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(events[0].occurredAt.getTime()).toBeLessThanOrEqual(after);
  });
});
