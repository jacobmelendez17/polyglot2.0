import { describe, expect, it } from "vitest";

import { canAccessAdminArea, canManageCurriculum } from "./authorization";
import type { PolyglotUser, UserRole } from "@/domains/users";

function withRole(role: UserRole): Pick<PolyglotUser, "role"> {
  return { role };
}

describe("canAccessAdminArea", () => {
  it("admits an admin", () => {
    expect(canAccessAdminArea(withRole("admin"))).toBe(true);
  });

  it("admits a developer", () => {
    expect(canAccessAdminArea(withRole("developer"))).toBe(true);
  });

  it("denies a normal user", () => {
    expect(canAccessAdminArea(withRole("user"))).toBe(false);
  });

  it("denies a beta-tester", () => {
    expect(canAccessAdminArea(withRole("beta-tester"))).toBe(false);
  });
});

describe("canManageCurriculum", () => {
  it("admits an admin", () => {
    expect(canManageCurriculum(withRole("admin"))).toBe(true);
  });

  it("denies a developer without the admin role", () => {
    expect(canManageCurriculum(withRole("developer"))).toBe(false);
  });

  it("denies a normal user", () => {
    expect(canManageCurriculum(withRole("user"))).toBe(false);
  });
});
