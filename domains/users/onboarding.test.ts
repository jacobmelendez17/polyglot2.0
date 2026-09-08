import { describe, expect, it } from "vitest";

import { isOnboardingRequired } from "./onboarding";

describe("isOnboardingRequired (spec 15)", () => {
  it("requires onboarding for a freshly provisioned account", () => {
    expect(isOnboardingRequired({ isSandbox: false, onboardingCompletedAt: null })).toBe(true);
  });

  it("does not show onboarding again once it has been completed", () => {
    expect(isOnboardingRequired({ isSandbox: false, onboardingCompletedAt: new Date("2026-09-09T10:00:00Z") })).toBe(false);
  });

  it("treats completion as a plain presence check, never a recency or version comparison", () => {
    // An ancient completion is still a completion — nothing re-triggers onboarding.
    expect(isOnboardingRequired({ isSandbox: false, onboardingCompletedAt: new Date("1999-01-01T00:00:00Z") })).toBe(false);
  });

  it("exempts sandbox personas, so Open Sandbox never lands on a welcome tour", () => {
    expect(isOnboardingRequired({ isSandbox: true, onboardingCompletedAt: null })).toBe(false);
    expect(isOnboardingRequired({ isSandbox: true, onboardingCompletedAt: new Date() })).toBe(false);
  });
});
