import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const captureAnalyticsIntent = vi.hoisted(() => vi.fn());
const withTrace = vi.hoisted(() => vi.fn());

vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/analytics/server", () => ({ captureAnalyticsIntent }));
// `withTrace` is covered by its own tests; here it only has to run the callback.
vi.mock("@/lib/logging/operation-tracer", () => ({ withTrace }));

import { captureAnalyticsIntentAction } from "./analytics-actions";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";

beforeEach(() => {
  requireUser.mockReset();
  captureAnalyticsIntent.mockReset();
  withTrace.mockReset();
  withTrace.mockImplementation(
    (_operation: string, fn: () => Promise<unknown>) => fn(),
  );
  requireUser.mockResolvedValue({
    id: "session-user-id",
    activeLanguageId: "session-language-id",
  });
  captureAnalyticsIntent.mockResolvedValue(undefined);
});

describe("captureAnalyticsIntentAction", () => {
  it.each([
    [{ event: "onboarding_started" }],
    [{ event: "lesson_started", sessionKey: SESSION }],
    [{ event: "review_session_started", sessionKey: SESSION }],
  ] as const)(
    "accepts %j and reports it for the signed-in account",
    async (input) => {
      const result = await captureAnalyticsIntentAction(input);

      expect(result).toEqual({ ok: true, data: null });
      expect(captureAnalyticsIntent).toHaveBeenCalledTimes(1);
      // The account and language come from the session, never from the request.
      expect(captureAnalyticsIntent).toHaveBeenCalledWith({
        userId: "session-user-id",
        languageId: "session-language-id",
        intent: input,
      });
    },
  );

  it("runs under a fresh, quiet trace", async () => {
    await captureAnalyticsIntentAction({ event: "onboarding_started" });

    expect(withTrace).toHaveBeenCalledWith(
      "analytics.intent",
      expect.any(Function),
      { level: "debug", newTrace: true },
    );
  });

  it("refuses a request that tries to name the account, the language or any extra data", async () => {
    for (const extra of [
      { userId: "someone-else" },
      { user_id: "someone-else" },
      { languageId: "another-language" },
      { distinctId: "analytics-1" },
      { answer: "hunter2" },
      { email: "someone@example.com" },
      { url: "https://example.com/lessons" },
      { count: 40 },
      { properties: { level: 3 } },
    ]) {
      for (const base of [
        { event: "onboarding_started" },
        { event: "lesson_started", sessionKey: SESSION },
        { event: "review_session_started", sessionKey: SESSION },
      ]) {
        const result = await captureAnalyticsIntentAction({
          ...base,
          ...extra,
        } as never);
        expect(result).toMatchObject({
          ok: false,
          error: { code: "VALIDATION_FAILED" },
        });
      }
    }
    expect(captureAnalyticsIntent).not.toHaveBeenCalled();
  });

  it("refuses every event the server itself reports, so the browser cannot claim a completion", async () => {
    for (const event of [
      "lesson_completed",
      "review_item_completed",
      "review_session_completed",
      "onboarding_completed",
      "level_unlocked",
      "practice_started",
      "practice_completed",
      "dashboard_widget_added",
      "dashboard_widget_removed",
    ]) {
      const result = await captureAnalyticsIntentAction({
        event,
        sessionKey: SESSION,
      } as never);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
    expect(captureAnalyticsIntent).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a session key that is not a UUID",
      { event: "lesson_started", sessionKey: "not-a-uuid" },
    ],
    ["a missing session key", { event: "lesson_started" }],
    ["a missing session key on a review", { event: "review_session_started" }],
    ["a numeric session key", { event: "lesson_started", sessionKey: 12345 }],
    ["an unknown event", { event: "page_view" }],
    ["an inherited property name as the event", { event: "constructor" }],
    ["no event", {}],
    ["null", null],
    ["a string", "lesson_started"],
    ["an array", [{ event: "onboarding_started" }]],
    ["undefined", undefined],
  ])("refuses %s with a plain validation error", async (_label, input) => {
    const result = await captureAnalyticsIntentAction(input as never);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "That request isn't valid.",
      },
    });
    expect(captureAnalyticsIntent).not.toHaveBeenCalled();
  });

  it("does not echo what was invalid back to the caller", async () => {
    const result = await captureAnalyticsIntentAction({
      event: "lesson_started",
      sessionKey: "hunter2-not-a-uuid",
    } as never);

    expect(JSON.stringify(result)).not.toContain("hunter2");
  });

  it("answers an unauthenticated caller with the sign-in error and reports nothing", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));

    const result = await captureAnalyticsIntentAction({
      event: "onboarding_started",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(captureAnalyticsIntent).not.toHaveBeenCalled();
  });

  it("passes a rate-limit refusal through, so the page can ignore it", async () => {
    captureAnalyticsIntent.mockRejectedValue(
      new AppError("RATE_LIMITED", "Please slow down and try again in 9s."),
    );

    const result = await captureAnalyticsIntentAction({
      event: "lesson_started",
      sessionKey: SESSION,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Please slow down and try again in 9s.",
      },
    });
  });

  it("turns any other failure into a generic answer that leaks nothing", async () => {
    captureAnalyticsIntent.mockRejectedValue(
      new Error("connection refused: postgres://user:secret@host/db"),
    );

    const result = await captureAnalyticsIntentAction({
      event: "onboarding_started",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "Something went wrong." },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
