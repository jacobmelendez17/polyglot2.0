import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const completeOnboarding = vi.hoisted(() => vi.fn());
const check = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const scheduleAnalyticsEmission = vi.hoisted(() => vi.fn());
const buildOnboardingCompletedEvent = vi.hoisted(() =>
  vi.fn(({ languageId }: { languageId: string }) => ({
    event: "onboarding_completed",
    languageId,
  })),
);

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/domains/users/server", () => ({ requireUser, completeOnboarding }));
vi.mock("@/domains/analytics/server", () => ({
  scheduleAnalyticsEmission,
  buildOnboardingCompletedEvent,
}));
vi.mock("@/providers/rate-limit", () => ({
  getRateLimiter: () => ({ check }),
}));

import { completeOnboardingAction } from "./actions";

const USER = {
  id: "session-user-id",
  activeLanguageId: "session-language-id",
  isSandbox: false,
};

beforeEach(() => {
  requireUser.mockReset();
  completeOnboarding.mockReset();
  check.mockReset();
  revalidatePath.mockReset();
  scheduleAnalyticsEmission.mockReset();
  requireUser.mockResolvedValue(USER);
  check.mockResolvedValue({ allowed: true });
  // The write lands: the stored time is the one this request supplied.
  completeOnboarding.mockImplementation(async (_userId: string, now: Date) => ({
    onboardingCompletedAt: now,
  }));
});

describe("completeOnboardingAction", () => {
  it("completes onboarding for the signed-in account and reports the milestone once", async () => {
    await expect(completeOnboardingAction()).resolves.toEqual({
      ok: true,
      data: null,
    });

    expect(completeOnboarding).toHaveBeenCalledWith(USER.id, expect.any(Date));
    expect(buildOnboardingCompletedEvent).toHaveBeenCalledWith({
      languageId: "session-language-id",
    });
    expect(scheduleAnalyticsEmission).toHaveBeenCalledTimes(1);
    expect(scheduleAnalyticsEmission).toHaveBeenCalledWith(USER.id, [
      { event: "onboarding_completed", languageId: "session-language-id" },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("reports nothing when onboarding was already complete — a double click or a second tab", async () => {
    // The guarded update wrote nothing and returned the row as it already was.
    completeOnboarding.mockResolvedValue({
      onboardingCompletedAt: new Date("2026-01-01T00:00:00Z"),
    });

    await expect(completeOnboardingAction()).resolves.toEqual({
      ok: true,
      data: null,
    });

    expect(scheduleAnalyticsEmission).not.toHaveBeenCalled();
  });

  it.each([
    ["no row at all", undefined],
    ["a row with no completion time", { onboardingCompletedAt: null }],
  ])("reports nothing when the update returns %s", async (_label, row) => {
    completeOnboarding.mockResolvedValue(row);

    await completeOnboardingAction();

    expect(scheduleAnalyticsEmission).not.toHaveBeenCalled();
  });

  it("refuses a sandbox persona before completing or reporting anything", async () => {
    requireUser.mockResolvedValue({ ...USER, isSandbox: true });

    await expect(completeOnboardingAction()).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(scheduleAnalyticsEmission).not.toHaveBeenCalled();
  });

  it("completes and reports nothing once the rate limit is spent", async () => {
    check.mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });

    await expect(completeOnboardingAction()).resolves.toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });

    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(scheduleAnalyticsEmission).not.toHaveBeenCalled();
  });

  it("reports nothing when the write itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    completeOnboarding.mockRejectedValue(new Error("connection reset"));

    await expect(completeOnboardingAction()).resolves.toMatchObject({
      ok: false,
      error: { code: "UNKNOWN" },
    });

    expect(scheduleAnalyticsEmission).not.toHaveBeenCalled();
  });
});
