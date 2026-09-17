import { describe, expect, it } from "vitest";

import {
  canAccessAdminArea,
  canManageCurriculum,
  canPublishCurriculum,
  canUseDeveloperTools,
} from "./authorization";
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

describe("the writer role (spec 17)", () => {
  const writer = { role: "writer" as const };
  const admin = { role: "admin" as const };
  const developer = { role: "developer" as const };
  const learner = { role: "user" as const };

  it("lets a writer into the Admin area to author curriculum", () => {
    expect(canAccessAdminArea(writer)).toBe(true);
    expect(canManageCurriculum(writer)).toBe(true);
  });

  it("never lets a writer publish, archive, delete, or import", () => {
    // The whole point of the role: everything a writer does waits for an
    // Admin, so this is the boundary that makes their work reviewable.
    expect(canPublishCurriculum(writer)).toBe(false);
    expect(canPublishCurriculum(admin)).toBe(true);
  });

  it("keeps a writer out of the Sandbox and the logs", () => {
    expect(canUseDeveloperTools(writer)).toBe(false);
    expect(canUseDeveloperTools(developer)).toBe(true);
    expect(canUseDeveloperTools(admin)).toBe(true);
  });

  it("still refuses an ordinary learner everything", () => {
    expect(canAccessAdminArea(learner)).toBe(false);
    expect(canManageCurriculum(learner)).toBe(false);
    expect(canPublishCurriculum(learner)).toBe(false);
    expect(canUseDeveloperTools(learner)).toBe(false);
  });

  it("does not let a developer author or publish curriculum (spec 11 §4, unchanged)", () => {
    expect(canManageCurriculum(developer)).toBe(false);
    expect(canPublishCurriculum(developer)).toBe(false);
  });
});
