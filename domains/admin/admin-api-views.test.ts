import { describe, expect, it } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";

import type { AdminCurriculumItemsPage } from "@/domains/curriculum";

import {
  adminCurriculumPageSchema,
  adminMeSchema,
  adminOverviewSchema,
  type AdminCurriculumStatusCounts,
} from "./admin-api-contract";
import {
  buildAdminCurriculumPage,
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

  it("lists the curriculum list and review queue only for roles that may manage curriculum", () => {
    for (const role of ["admin", "writer"] as const) {
      expect(buildAdminPermissions({ role }).resources).toEqual({
        overview: ["show"],
        curriculum: ["list"],
        review: ["list"],
      });
    }
    // A developer reaches /admin but not curriculum.
    expect(buildAdminPermissions({ role: "developer" }).resources).toEqual({
      overview: ["show"],
    });
  });

  it("lists nothing for roles outside the Admin area", () => {
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

describe("buildAdminCurriculumPage", () => {
  const SERVICE_PAGE: AdminCurriculumItemsPage = {
    items: [
      {
        id: "item-1",
        type: "vocabulary",
        status: "draft",
        languageId: "lang-1",
        levelId: "level-1",
        levelNumber: 3,
        position: 7,
        itemLabel: "el gato",
        meaningLabel: "cat",
        groupId: "group-1",
        groupName: "Animals",
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        needsDefinition: true,
        needsExamples: true,
        needsIpa: false,
        needsPronunciation: false,
        needsSynonyms: false,
        needsVariations: false,
      },
    ],
    nextCursor: "next",
    hasPreviousPage: true,
    previousCursor: null,
  };

  it("carries only what a row needs, and the server's cursors untouched", () => {
    expect(buildAdminCurriculumPage(SERVICE_PAGE)).toEqual({
      items: [
        {
          id: "item-1",
          type: "vocabulary",
          status: "draft",
          levelId: "level-1",
          levelNumber: 3,
          itemLabel: "el gato",
          meaningLabel: "cat",
          groupId: "group-1",
          groupName: "Animals",
        },
      ],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: null,
    });
  });

  it("keeps the *display* status — a published item with an open draft reads draft", () => {
    expect(buildAdminCurriculumPage(SERVICE_PAGE).items[0]?.status).toBe(
      "draft",
    );
  });

  it("is contract-valid, and the contract strips anything extra", () => {
    const built = buildAdminCurriculumPage(SERVICE_PAGE);
    expect(adminCurriculumPageSchema.safeParse(built).success).toBe(true);

    const leaky = {
      ...built,
      items: [{ ...built.items[0], updatedAt: "2026-01-01", position: 7 }],
    };
    const parsed = adminCurriculumPageSchema.parse(leaky);
    expect(parsed.items[0]).not.toHaveProperty("updatedAt");
    expect(parsed.items[0]).not.toHaveProperty("position");
  });

  it("never invents a total", () => {
    expect(buildAdminCurriculumPage(SERVICE_PAGE)).not.toHaveProperty("total");
  });
});
