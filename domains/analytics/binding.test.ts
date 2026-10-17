import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors/app-error";

const check = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
const fakeDb = vi.hoisted(() => ({ marker: "the real db" }));
const service = vi.hoisted(() => ({
  getAnalyticsConsent: vi.fn(),
  setAnalyticsConsent: vi.fn(),
  resolveAnalyticsCaptureIdentity: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: fakeDb }));
vi.mock("@/providers/rate-limit", () => ({
  getRateLimiter: () => ({ check }),
}));
vi.mock("./analytics-consent-service", () => service);
vi.mock("@/lib/logging/logger", () => ({
  logger: {
    debug: vi.fn(),
    info,
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  getAnalyticsConsent,
  resolveAnalyticsCaptureIdentity,
  setAnalyticsConsent,
} from "./binding";

const INPUT = {
  userId: "user-1",
  status: "accepted",
  expectedRevision: null,
} as const;
const VIEW = { status: "accepted", revision: 1, needsReview: false } as const;

beforeEach(() => {
  check.mockReset();
  info.mockReset();
  for (const fn of Object.values(service)) fn.mockReset();
  check.mockResolvedValue({ allowed: true });
  service.setAnalyticsConsent.mockResolvedValue(VIEW);
});

describe("setAnalyticsConsent (bound)", () => {
  it("spends the ordinary Settings limit for this account, then saves against the real database", async () => {
    await expect(setAnalyticsConsent(INPUT)).resolves.toEqual(VIEW);

    expect(check).toHaveBeenCalledWith({
      policy: "account-settings",
      subject: "user-1",
    });
    expect(service.setAnalyticsConsent).toHaveBeenCalledWith(fakeDb, INPUT);
  });

  it("refuses with RATE_LIMITED, saving nothing, when the limit is spent", async () => {
    check.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

    await expect(setAnalyticsConsent(INPUT)).rejects.toMatchObject({
      name: "AppError",
      code: "RATE_LIMITED",
      message: expect.stringContaining("42s"),
    });
    expect(service.setAnalyticsConsent).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter itself cannot be reached", async () => {
    check.mockRejectedValue(new Error("the rate limiter is unreachable"));

    await expect(setAnalyticsConsent(INPUT)).rejects.toThrow("unreachable");
    expect(service.setAnalyticsConsent).not.toHaveBeenCalled();
  });

  it("logs the outcome and the revision — and nothing that identifies the learner", async () => {
    await setAnalyticsConsent(INPUT);

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({
      event: "analytics.consent.saved",
      status: "accepted",
      revision: 1,
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain("user-1");
  });

  it("logs nothing when the service refuses", async () => {
    service.setAnalyticsConsent.mockRejectedValue(
      new AppError("STALE_SETTING"),
    );

    await expect(setAnalyticsConsent(INPUT)).rejects.toMatchObject({
      code: "STALE_SETTING",
    });
    expect(info).not.toHaveBeenCalled();
  });
});

describe("reads (bound)", () => {
  it("reads the stored choice from the real database, with no rate limit", async () => {
    service.getAnalyticsConsent.mockResolvedValue(VIEW);

    await expect(getAnalyticsConsent("user-1")).resolves.toEqual(VIEW);
    expect(service.getAnalyticsConsent).toHaveBeenCalledWith(fakeDb, "user-1");
    expect(check).not.toHaveBeenCalled();
  });

  it("resolves the capture identity from the real database on every call", async () => {
    service.resolveAnalyticsCaptureIdentity.mockResolvedValue({
      distinctId: "an-id",
    });

    await expect(resolveAnalyticsCaptureIdentity("user-1")).resolves.toEqual({
      distinctId: "an-id",
    });
    await resolveAnalyticsCaptureIdentity("user-1");

    expect(service.resolveAnalyticsCaptureIdentity).toHaveBeenCalledTimes(2);
    expect(service.resolveAnalyticsCaptureIdentity).toHaveBeenCalledWith(
      fakeDb,
      "user-1",
    );
    expect(check).not.toHaveBeenCalled();
  });
});
