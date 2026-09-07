import { describe, expect, it } from "vitest";

import { canViewSandboxAs } from "./sandbox-view";

const ADMIN = { id: "admin-1", role: "admin" as const };
const DEVELOPER = { id: "dev-1", role: "developer" as const };
const LEARNER = { id: "user-1", role: "user" as const };

const OWNED_SANDBOX = { isSandbox: true, sandboxOwnerUserId: "admin-1" };
const OTHER_SANDBOX = { isSandbox: true, sandboxOwnerUserId: "admin-2" };
const REAL_LEARNER = { isSandbox: false, sandboxOwnerUserId: null };

describe("canViewSandboxAs", () => {
  it("allows an admin to view their own sandbox persona", () => {
    expect(canViewSandboxAs(ADMIN, OWNED_SANDBOX)).toBe(true);
  });

  it("allows a developer to view their own sandbox persona (spec 11 §4 admits both roles)", () => {
    expect(canViewSandboxAs(DEVELOPER, { isSandbox: true, sandboxOwnerUserId: "dev-1" })).toBe(true);
  });

  it("refuses another admin's sandbox", () => {
    expect(canViewSandboxAs(ADMIN, OTHER_SANDBOX)).toBe(false);
  });

  it("refuses a real learner account outright, even one an admin somehow 'owns'", () => {
    expect(canViewSandboxAs(ADMIN, REAL_LEARNER)).toBe(false);
    expect(canViewSandboxAs(ADMIN, { isSandbox: false, sandboxOwnerUserId: "admin-1" })).toBe(false);
  });

  it("refuses an ordinary learner, whatever the target", () => {
    expect(canViewSandboxAs(LEARNER, OWNED_SANDBOX)).toBe(false);
    expect(canViewSandboxAs(LEARNER, { isSandbox: true, sandboxOwnerUserId: "user-1" })).toBe(false);
  });

  it("refuses a sandbox with no owner recorded", () => {
    expect(canViewSandboxAs(ADMIN, { isSandbox: true, sandboxOwnerUserId: null })).toBe(false);
  });
});
