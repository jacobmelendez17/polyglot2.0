import { describe, expect, it } from "vitest";

import { hasRole, requireRole } from "./role-helpers";
import type { PolyglotUser, UserRole } from "./user-types";

// Role-helper tests only ever construct the user's `role` field directly, as
// the database itself would return it — spec 08 §56's "do not mock a
// client-controlled role source as authoritative" guards against deriving
// this from something like Clerk metadata instead.
function withRole(role: UserRole): Pick<PolyglotUser, "role"> {
  return { role };
}

describe("hasRole", () => {
  it("resolves a normal user as user", () => {
    expect(hasRole(withRole("user"), "user")).toBe(true);
  });

  it("resolves an admin as admin", () => {
    expect(hasRole(withRole("admin"), "admin")).toBe(true);
  });

  it("resolves a beta tester correctly", () => {
    expect(hasRole(withRole("beta-tester"), "beta-tester")).toBe(true);
  });

  it("resolves a developer correctly", () => {
    expect(hasRole(withRole("developer"), "developer")).toBe(true);
  });

  it("passes an allowed role check against a list", () => {
    expect(hasRole(withRole("admin"), ["admin", "developer"])).toBe(true);
  });

  it("fails a disallowed role check", () => {
    expect(hasRole(withRole("user"), "admin")).toBe(false);
  });

  it("fails a disallowed role check against a list", () => {
    expect(hasRole(withRole("beta-tester"), ["admin", "developer"])).toBe(false);
  });
});

describe("requireRole", () => {
  it("returns the user unchanged when the role is allowed", () => {
    const user = withRole("developer");
    expect(requireRole(user, "developer")).toBe(user);
  });

  it("throws FORBIDDEN when the role is disallowed", () => {
    expect(() => requireRole(withRole("user"), "admin")).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});
