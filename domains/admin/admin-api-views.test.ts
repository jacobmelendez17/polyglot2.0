import { describe, expect, it } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";

import type {
  AdminCurriculumItemsPage,
  CurriculumLevel,
  LevelContentCounts,
} from "@/domains/curriculum";

import {
  ADMIN_CEFR_LEVELS,
  LEVEL_LIST_MAX,
  adminCurriculumPageSchema,
  adminLevelListSchema,
  adminMeSchema,
  adminOverviewSchema,
  type AdminCurriculumStatusCounts,
} from "./admin-api-contract";
import {
  buildAdminCurriculumPage,
  buildAdminLevelList,
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

  it("lists the curriculum list, review queue, and levels only for roles that may manage curriculum", () => {
    // An Admin may also create and edit a level; a writer may only read them.
    expect(buildAdminPermissions({ role: "admin" }).resources).toEqual({
      overview: ["show"],
      curriculum: ["list"],
      review: ["list"],
      levels: ["list", "create", "edit"],
    });
    expect(buildAdminPermissions({ role: "writer" }).resources).toEqual({
      overview: ["show"],
      curriculum: ["list"],
      review: ["list"],
      levels: ["list"],
    });
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

describe("buildAdminLevelList", () => {
  function level(
    levelNumber: number,
    overrides: Partial<CurriculumLevel> = {},
  ): CurriculumLevel {
    return {
      id: `level-${levelNumber}`,
      languageId: "lang-1",
      levelNumber,
      name: null,
      status: "draft",
      cefrLevel: null,
      ...overrides,
    };
  }
  const counts = (
    entries: Record<string, Partial<LevelContentCounts>>,
  ): Map<string, LevelContentCounts> =>
    new Map(
      Object.entries(entries).map(([id, partial]) => [
        id,
        {
          vocabularyItems: 0,
          grammarItems: 0,
          vocabularyGroups: 0,
          ...partial,
        },
      ]),
    );

  it("carries what a row shows, with the level's own counts joined on", () => {
    const list = buildAdminLevelList(
      [level(1, { name: "Basics", status: "published", cefrLevel: "A1" })],
      counts({
        "level-1": {
          vocabularyItems: 45,
          grammarItems: 12,
          vocabularyGroups: 4,
        },
      }),
    );
    expect(list).toEqual({
      items: [
        {
          id: "level-1",
          levelNumber: 1,
          name: "Basics",
          status: "published",
          cefrLevel: "A1",
          vocabularyItems: 45,
          grammarItems: 12,
          vocabularyGroups: 4,
        },
      ],
      truncated: false,
    });
  });

  it("reads a level with no entry in the counts as holding nothing", () => {
    const [row] = buildAdminLevelList([level(7)], new Map()).items;
    expect(row).toMatchObject({
      vocabularyItems: 0,
      grammarItems: 0,
      vocabularyGroups: 0,
    });
  });

  it("orders by level number whatever order it was handed", () => {
    const list = buildAdminLevelList([level(3), level(1), level(2)], new Map());
    expect(list.items.map((row) => row.levelNumber)).toEqual([1, 2, 3]);
  });

  it("is empty, and not truncated, for a language with no levels", () => {
    expect(buildAdminLevelList([], new Map())).toEqual({
      items: [],
      truncated: false,
    });
  });

  it("is bounded, and says so when it cut something off", () => {
    const many = Array.from({ length: LEVEL_LIST_MAX + 5 }, (_, i) =>
      level(i + 1),
    );
    const list = buildAdminLevelList(many, new Map());
    expect(list.items).toHaveLength(LEVEL_LIST_MAX);
    expect(list.items.at(-1)?.levelNumber).toBe(LEVEL_LIST_MAX);
    expect(list.truncated).toBe(true);

    const exactly = buildAdminLevelList(
      many.slice(0, LEVEL_LIST_MAX),
      new Map(),
    );
    expect(exactly.truncated).toBe(false);
  });

  it("never leaks what the read model carries beyond the row", () => {
    const list = buildAdminLevelList(
      [{ ...level(1), curriculumKey: "es-MX:level:abc", secret: "x" } as never],
      new Map(),
    );
    expect(Object.keys(list.items[0]!).sort()).toEqual([
      "cefrLevel",
      "grammarItems",
      "id",
      "levelNumber",
      "name",
      "status",
      "vocabularyGroups",
      "vocabularyItems",
    ]);
  });

  it("is contract-valid for every CEFR band and for none", () => {
    const levels = [
      level(1),
      ...ADMIN_CEFR_LEVELS.map((band, i) => level(i + 2, { cefrLevel: band })),
    ];
    expect(
      adminLevelListSchema.safeParse(buildAdminLevelList(levels, new Map()))
        .success,
    ).toBe(true);
  });
});
