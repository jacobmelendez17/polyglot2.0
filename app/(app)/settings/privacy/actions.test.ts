import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors/app-error";

const requireUser = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const setAnalyticsConsent = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/analytics/server", () => ({ setAnalyticsConsent }));
// `withTrace` is covered by its own tests; here it only has to run the callback.
vi.mock("@/lib/logging/operation-tracer", () => ({
  withTrace: (_operation: string, fn: () => Promise<unknown>) => fn(),
}));

import { setAnalyticsConsentAction } from "./actions";

const VIEW = { status: "accepted", revision: 1, needsReview: false } as const;

beforeEach(() => {
  requireUser.mockReset();
  revalidatePath.mockReset();
  setAnalyticsConsent.mockReset();
  requireUser.mockResolvedValue({ id: "session-user-id" });
  setAnalyticsConsent.mockResolvedValue(VIEW);
});

describe("setAnalyticsConsentAction", () => {
  it("saves the choice for the signed-in account and nobody else", async () => {
    const result = await setAnalyticsConsentAction({
      status: "accepted",
      expectedRevision: null,
    });

    expect(result).toEqual({ ok: true, data: VIEW });
    expect(setAnalyticsConsent).toHaveBeenCalledTimes(1);
    expect(setAnalyticsConsent).toHaveBeenCalledWith({
      userId: "session-user-id",
      status: "accepted",
      expectedRevision: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/privacy");
  });

  it("passes the revision the page last saw through to the service", async () => {
    await setAnalyticsConsentAction({
      status: "declined",
      expectedRevision: 7,
    });
    expect(setAnalyticsConsent).toHaveBeenCalledWith({
      userId: "session-user-id",
      status: "declined",
      expectedRevision: 7,
    });
  });

  it("refuses a request that tries to name the account, however it is spelled", async () => {
    for (const extra of [
      { userId: "someone-else" },
      { user_id: "someone-else" },
      { analyticsId: "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11" },
      { captureAllowed: true },
    ]) {
      const result = await setAnalyticsConsentAction({
        status: "accepted",
        expectedRevision: null,
        ...extra,
      } as never);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
    expect(setAnalyticsConsent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown status", { status: "unknown", expectedRevision: null }],
    ["a missing status", { expectedRevision: null }],
    ["a missing revision", { status: "accepted" }],
    ["a revision of zero", { status: "accepted", expectedRevision: 0 }],
    ["a negative revision", { status: "accepted", expectedRevision: -1 }],
    ["a fractional revision", { status: "accepted", expectedRevision: 1.5 }],
    ["a revision sent as text", { status: "accepted", expectedRevision: "3" }],
    [
      "a revision of undefined",
      { status: "accepted", expectedRevision: undefined },
    ],
    ["a boolean status", { status: true, expectedRevision: null }],
  ])("refuses %s", async (_label, input) => {
    const result = await setAnalyticsConsentAction(input as never);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(setAnalyticsConsent).not.toHaveBeenCalled();
  });

  it("does not save, or touch the cache, when nobody is signed in", async () => {
    requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED"));

    const result = await setAnalyticsConsentAction({
      status: "accepted",
      expectedRevision: null,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(setAnalyticsConsent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["STALE_SETTING", "RATE_LIMITED", "FORBIDDEN"] as const)(
    "reports a %s from the service in its own words and does not refresh the page",
    async (code) => {
      setAnalyticsConsent.mockRejectedValue(
        new AppError(code, `a message for ${code}`),
      );

      const result = await setAnalyticsConsentAction({
        status: "accepted",
        expectedRevision: 2,
      });

      expect(result).toEqual({
        ok: false,
        error: { code, message: `a message for ${code}` },
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("hides an unexpected failure behind a safe message", async () => {
    setAnalyticsConsent.mockRejectedValue(
      new Error("connect ECONNREFUSED postgres://user:hunter2@db.internal/app"),
    );

    const result = await setAnalyticsConsentAction({
      status: "accepted",
      expectedRevision: null,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });
});
