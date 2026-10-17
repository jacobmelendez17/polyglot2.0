import { describe, expect, it } from "vitest";

import {
  ANALYTICS_POLICY_VERSION,
  isAnalyticsCaptureAllowed,
  resolveAnalyticsConsent,
  type StoredAnalyticsConsent,
} from "./analytics-consent";

const ID = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const CURRENT = ANALYTICS_POLICY_VERSION;
const OLDER = "2020-01-01";

function stored(
  overrides: Partial<StoredAnalyticsConsent> = {},
): StoredAnalyticsConsent {
  return {
    status: "accepted",
    policyVersion: CURRENT,
    analyticsId: ID,
    revision: 3,
    ...overrides,
  };
}

describe("resolveAnalyticsConsent", () => {
  it("reads as unknown, with no revision, for a learner who has never chosen", () => {
    expect(resolveAnalyticsConsent(null)).toEqual({
      status: "unknown",
      revision: null,
      needsReview: false,
    });
  });

  it("reads an acceptance under the current notice as accepted", () => {
    expect(resolveAnalyticsConsent(stored())).toEqual({
      status: "accepted",
      revision: 3,
      needsReview: false,
    });
  });

  it("reads a decline as declined", () => {
    expect(
      resolveAnalyticsConsent(
        stored({ status: "declined", analyticsId: null }),
      ),
    ).toEqual({ status: "declined", revision: 3, needsReview: false });
  });

  it("stops counting an acceptance recorded under an older notice, and asks the learner to choose again", () => {
    expect(resolveAnalyticsConsent(stored({ policyVersion: OLDER }))).toEqual({
      status: "unknown",
      revision: 3,
      needsReview: true,
    });
  });

  it("never lets a decline expire: it holds whatever version it was recorded under", () => {
    expect(
      resolveAnalyticsConsent(
        stored({ status: "declined", policyVersion: OLDER, analyticsId: null }),
      ),
    ).toEqual({ status: "declined", revision: 3, needsReview: false });
  });

  it("judges against the version it is given, not a hard-wired one", () => {
    expect(resolveAnalyticsConsent(stored(), "next-version")).toEqual({
      status: "unknown",
      revision: 3,
      needsReview: true,
    });
    expect(
      resolveAnalyticsConsent(
        stored({ policyVersion: "next-version" }),
        "next-version",
      ).status,
    ).toBe("accepted");
  });

  it("never carries the pseudonym", () => {
    const view = resolveAnalyticsConsent(stored());
    expect(JSON.stringify(view)).not.toContain(ID);
  });
});

describe("isAnalyticsCaptureAllowed — default deny", () => {
  it("allows only a current acceptance that has its pseudonym", () => {
    expect(isAnalyticsCaptureAllowed(stored())).toBe(true);
  });

  it.each([
    ["nothing is stored", null],
    ["the learner declined", stored({ status: "declined", analyticsId: null })],
    [
      "the learner declined but a pseudonym still exists",
      stored({ status: "declined" }),
    ],
    ["the acceptance is for an older notice", stored({ policyVersion: OLDER })],
    ["an acceptance has lost its pseudonym", stored({ analyticsId: null })],
  ])("refuses when %s", (_label, value) => {
    expect(isAnalyticsCaptureAllowed(value)).toBe(false);
  });

  it("refuses an acceptance the moment the notice version moves on", () => {
    expect(isAnalyticsCaptureAllowed(stored(), "a-newer-notice")).toBe(false);
  });
});

describe("ANALYTICS_POLICY_VERSION", () => {
  it("is a date, so a change is easy to read in the stored rows", () => {
    expect(ANALYTICS_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
