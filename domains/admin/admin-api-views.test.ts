import { describe, expect, it } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";

import {
  adminMeSchema,
  adminOverviewSchema,
  type AdminCurriculumStatusCounts,
} from "./admin-api-contract";
import {
  buildAdminMe,
  buildAdminOverview,
  buildAdminPermissions,
} from "./admin-api-views";

const COUNTS: AdminCurriculumStatusCounts = {
  published: 55,
  pending: 3,
  draft: 2,
  archived: 1,
};

function user(role: UserRole) {
  return { id: `user-${role}`, role, activeLanguageId: "lang-1" };
}

describe("buildAdminPermissions", () => {
  // The five-role matrix from spec 26 §6, as the server states it.
  const EXPECTED: Record<
    UserRole,
    {
      canAccessAdminArea: boolean;
      canManageCurriculum: boolean;
      canPublishCurriculum: boolean;
      canUseDeveloperTools: boolean;
    }
  > = {
    admin: {
      canAccessAdminArea: true,
      canManageCurriculum: true,
      canPublishCurriculum: true,
      canUseDeveloperTools: true,
    },
    writer: {
      canAccessAdminArea: true,
      canManageCurriculum: true,
      canPublishCurriculum: false,
      canUseDeveloperTools: false,
    },
    developer: {
      canAccessAdminArea: true,
      canManageCurriculum: false,
      canPublishCurriculum: false,
      canUseDeveloperTools: true,
    },
    user: {
      canAccessAdminArea: false,
      canManageCurriculum: false,
      canPublishCurriculum: false,
      canUseDeveloperTools: false,
    },
    "beta-tester": {
      canAccessAdminArea: false,
      canManageCurriculum: false,
      canPublishCurriculum: false,
      canUseDeveloperTools: false,
    },
  };

  it.each(USER_ROLES)("projects the existing predicates for %s", (role) => {
    expect(buildAdminPermissions({ role })).toMatchObject(EXPECTED[role]);
  });

  it("only lists the overview resource for an Admin-area role", () => {
    expect(buildAdminPermissions({ role: "writer" }).resources).toEqual({
      overview: ["show"],
    });
    expect(buildAdminPermissions({ role: "developer" }).resources).toEqual({
      overview: ["show"],
    });
    expect(buildAdminPermissions({ role: "user" }).resources).toEqual({});
    expect(buildAdminPermissions({ role: "beta-tester" }).resources).toEqual(
      {},
    );
  });
});

describe("buildAdminMe", () => {
  it.each(USER_ROLES)("produces a contract-valid payload for %s", (role) => {
    expect(adminMeSchema.safeParse(buildAdminMe(user(role))).success).toBe(
      true,
    );
  });

  it("carries the internal id and role, and nothing else about the person", () => {
    const me = buildAdminMe({
      ...user("admin"),
      // Fields a careless spread could leak. Not in the type, but present at runtime.
      ...({ clerkUserId: "clerk_secret", displayName: "Jacob" } as object),
    });
    expect(Object.keys(me).sort()).toEqual(["id", "permissions", "role"]);
    expect(adminMeSchema.parse(me)).not.toHaveProperty("clerkUserId");
  });
});

describe("buildAdminOverview", () => {
  it("scopes the overview to the caller's active language", () => {
    const overview = buildAdminOverview(user("admin"), COUNTS);
    expect(overview.languageId).toBe("lang-1");
    expect(overview.id).toBe("current");
  });

  it.each(["admin", "writer"] as const)(
    "includes curriculum counts for %s",
    (role) => {
      expect(buildAdminOverview(user(role), COUNTS).curriculum).toEqual(COUNTS);
    },
  );

  it("never includes counts for a developer, even if a caller passes them", () => {
    expect(buildAdminOverview(user("developer"), COUNTS).curriculum).toBeNull();
  });

  it("uses null, not zeros, when counts were not loaded", () => {
    expect(buildAdminOverview(user("admin"), null).curriculum).toBeNull();
  });

  it("is always contract-valid", () => {
    for (const role of USER_ROLES) {
      expect(
        adminOverviewSchema.safeParse(buildAdminOverview(user(role), COUNTS))
          .success,
      ).toBe(true);
    }
  });
});
