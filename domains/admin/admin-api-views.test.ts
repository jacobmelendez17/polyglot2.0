import { describe, expect, it } from "vitest";

import { USER_ROLES, type UserRole } from "@/domains/users";

import type { MappingQueueRow } from "@/domains/lexicon";

import type { CurriculumImportRecord } from "./curriculum-import-types";
import type {
  AdminCurriculumItemsPage,
  CurriculumLevel,
  CurriculumVocabularyGroup,
  LevelContentCounts,
} from "@/domains/curriculum";

import {
  ADMIN_CEFR_LEVELS,
  DECK_LIST_MAX,
  GROUP_LIST_MAX,
  LEVEL_LIST_MAX,
  adminCurriculumPageSchema,
  adminDeckListSchema,
  adminDictionaryPageSchema,
  adminGroupListSchema,
  adminImportPageSchema,
  adminLevelListSchema,
  adminMeSchema,
  adminOverviewSchema,
  adminUserPageSchema,
  type AdminCurriculumStatusCounts,
} from "./admin-api-contract";
import {
  buildAdminCurriculumPage,
  buildAdminDeckList,
  buildAdminDictionaryPage,
  buildAdminGroupList,
  buildAdminImportPage,
  buildAdminLevelList,
  buildAdminMe,
  buildAdminOverview,
  buildAdminPermissions,
  buildAdminUserPage,
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
      groups: ["list", "create", "edit"],
      // Spec 26 Unit 8: an Admin starts an import (`create`), archives and
      // restores one (`edit`), and permanently deletes its history (`delete`).
      imports: ["list", "create", "edit", "delete"],
      // Spec 26 Unit 9: finding work and confirming reviewed mappings is authoring.
      dictionary: ["list", "edit"],
      // Spec 26 Unit 10: official decks are an Admin's end to end.
      decks: ["list", "create", "edit", "delete"],
      // Spec 26 Unit 6: only an Admin has the account list at all.
      users: ["list", "edit"],
    });
    expect(buildAdminPermissions({ role: "writer" }).resources).toEqual({
      overview: ["show"],
      curriculum: ["list"],
      review: ["list"],
      levels: ["list"],
      groups: ["list"],
      // A writer reads what has been imported; none of the commands are theirs.
      imports: ["list"],
      // A writer authors mappings (`edit` is confirming a reviewed match) — and,
      // unlike for an Admin, there is no `decks` at all: absent, not empty.
      dictionary: ["list", "edit"],
    });
    // A developer reaches /admin but not curriculum.
    expect(buildAdminPermissions({ role: "developer" }).resources).toEqual({
      overview: ["show"],
    });
  });

  // The spec's role matrix: "Change user role" is the one row with a single Yes.
  it.each(USER_ROLES)(
    "gives %s the users resource, and canManageUsers, only if they are an Admin",
    (role) => {
      const permissions = buildAdminPermissions({ role });
      expect(permissions.canManageUsers).toBe(role === "admin");
      // Absent — not an empty list — so "no access" is never read as "no accounts".
      expect(Object.hasOwn(permissions.resources, "users")).toBe(
        role === "admin",
      );
    },
  );

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

describe("buildAdminGroupList", () => {
  function group(
    position: number,
    overrides: Partial<CurriculumVocabularyGroup> = {},
  ): CurriculumVocabularyGroup {
    return {
      id: `group-${position}`,
      levelId: "level-1",
      languageId: "lang-1",
      name: `Group ${position}`,
      position,
      status: "draft",
      ...overrides,
    };
  }

  it("carries what a row shows, and nothing else the read model has", () => {
    const list = buildAdminGroupList([
      {
        ...group(2, { name: "Colors", status: "published" }),
        curriculumKey: "es-MX:group:abc",
      } as never,
    ]);
    expect(list).toEqual({
      items: [
        {
          id: "group-2",
          levelId: "level-1",
          name: "Colors",
          status: "published",
          position: 2,
        },
      ],
      truncated: false,
    });
    expect(Object.keys(list.items[0]!).sort()).toEqual([
      "id",
      "levelId",
      "name",
      "position",
      "status",
    ]);
  });

  it("orders by position whatever order it was handed, so the list is deterministic", () => {
    const list = buildAdminGroupList([group(3), group(1), group(2)]);
    expect(list.items.map((row) => row.position)).toEqual([1, 2, 3]);
  });

  it("breaks a tie by id, so even a shared position gives one order", () => {
    const a = group(1, { id: "a" });
    const b = group(1, { id: "b" });
    expect(buildAdminGroupList([b, a]).items.map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
    expect(buildAdminGroupList([a, b]).items.map((r) => r.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("keeps every status — an Admin list shows archived and draft groups too", () => {
    const list = buildAdminGroupList([
      group(1, { status: "archived" }),
      group(2, { status: "draft" }),
      group(3, { status: "pending" }),
      group(4, { status: "published" }),
    ]);
    expect(list.items.map((row) => row.status)).toEqual([
      "archived",
      "draft",
      "pending",
      "published",
    ]);
  });

  it("is empty, and not truncated, for a level with no groups", () => {
    expect(buildAdminGroupList([])).toEqual({ items: [], truncated: false });
  });

  it("is bounded, and says so when it cut something off", () => {
    const many = Array.from({ length: GROUP_LIST_MAX + 4 }, (_, i) =>
      group(i + 1),
    );
    const list = buildAdminGroupList(many);
    expect(list.items).toHaveLength(GROUP_LIST_MAX);
    expect(list.items.at(-1)?.position).toBe(GROUP_LIST_MAX);
    expect(list.truncated).toBe(true);
    expect(buildAdminGroupList(many.slice(0, GROUP_LIST_MAX)).truncated).toBe(
      false,
    );
  });

  it("is contract-valid", () => {
    expect(
      adminGroupListSchema.safeParse(
        buildAdminGroupList([group(1), group(2, { status: "published" })]),
      ).success,
    ).toBe(true);
  });
});

describe("buildAdminUserPage (spec 26 Unit 6)", () => {
  const record = {
    id: "11111111-1111-4111-8111-111111111111",
    displayName: "Ana Lopez",
    username: "ana_lopez",
    role: "writer" as const,
    createdAt: "2026-03-01T12:00:00.000100Z",
    updatedAt: "2026-03-02T09:30:15.123456Z",
  };

  it("passes the page through, field for field, and satisfies the contract", () => {
    const page = buildAdminUserPage({
      items: [record],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "prev",
    });

    expect(page).toEqual({
      items: [record],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "prev",
    });
    expect(adminUserPageSchema.safeParse(page).success).toBe(true);
  });

  it("carries only the six fields the console may show — whatever else the read model grows", () => {
    const page = buildAdminUserPage({
      items: [
        {
          ...record,
          // Present at runtime, absent from the type: what a careless spread would leak.
          clerkUserId: "user_must_never_appear",
          email: "private@example.com",
          timezone: "Europe/Madrid",
          isSandbox: false,
        } as typeof record,
      ],
      nextCursor: null,
      hasPreviousPage: false,
      previousCursor: null,
    });

    expect(Object.keys(page.items[0]!).sort()).toEqual([
      "createdAt",
      "displayName",
      "id",
      "role",
      "updatedAt",
      "username",
    ]);
    const text = JSON.stringify(page);
    expect(text).not.toContain("user_must_never_appear");
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("Europe/Madrid");
  });

  it("keeps the version token exactly as the database gave it — microseconds and all", () => {
    const [row] = buildAdminUserPage({
      items: [record],
      nextCursor: null,
      hasPreviousPage: false,
      previousCursor: null,
    }).items;
    expect(row!.updatedAt).toBe("2026-03-02T09:30:15.123456Z");
  });

  it("handles an empty page", () => {
    expect(
      buildAdminUserPage({
        items: [],
        nextCursor: null,
        hasPreviousPage: false,
        previousCursor: null,
      }),
    ).toEqual({
      items: [],
      nextCursor: null,
      hasPreviousPage: false,
      previousCursor: null,
    });
  });
});

describe("buildAdminImportPage (spec 26 Unit 8)", () => {
  const record: CurriculumImportRecord = {
    id: "00000000-0000-4000-8000-000000000001",
    environment: "development",
    languageId: "00000000-0000-4000-8000-0000000000aa",
    originalFilename: "spanish-level-2.csv",
    fileExtension: "csv",
    s3Bucket: "polyglot-private-bucket",
    s3Key: "imports/private-key/source.csv",
    sourceSha256: "deadbeef".repeat(8),
    uploadedByUserId: "00000000-0000-4000-8000-0000000000bb",
    status: "needs_review",
    totalRows: 61,
    createCount: 43,
    updateCount: 8,
    moveCount: 2,
    unchangedCount: 6,
    reviewCount: 2,
    skippedCount: 0,
    previewVersion: 1,
    confirmedPreviewVersion: null,
    draftedItemIds: ["00000000-0000-4000-8000-0000000000cc"],
    attemptCount: 1,
    lastErrorCode: "S3_READ_FAILED",
    lastErrorSummary: "Could not read the object from the private bucket.",
    sourceImportId: null,
    uploadedAt: new Date("2026-09-10T12:00:00.000Z"),
    previewStartedAt: null,
    previewCompletedAt: null,
    confirmedAt: null,
    importStartedAt: null,
    completedAt: null,
    archivedAt: null,
    archivedByUserId: null,
    createdAt: new Date("2026-09-10T11:59:00.123Z"),
    updatedAt: new Date("2026-09-10T12:05:00.000Z"),
  };

  const page = (items: CurriculumImportRecord[]) => ({
    items,
    nextCursor: "next",
    hasPreviousPage: true,
    previousCursor: "previous",
  });

  it("keeps the cursors exactly as the service gave them, and nothing else about the paging", () => {
    expect(buildAdminImportPage(page([record]))).toMatchObject({
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: "previous",
    });
  });

  it("shows what an import found, and when — dates as ISO text", () => {
    const [row] = buildAdminImportPage(page([record])).items;
    expect(row).toEqual({
      id: record.id,
      originalFilename: "spanish-level-2.csv",
      status: "needs_review",
      totalRows: 61,
      createCount: 43,
      updateCount: 8,
      moveCount: 2,
      unchangedCount: 6,
      reviewCount: 2,
      skippedCount: 0,
      attemptCount: 1,
      createdAt: "2026-09-10T11:59:00.123Z",
      archivedAt: null,
    });
  });

  it("says when an archived import was archived", () => {
    const [row] = buildAdminImportPage(
      page([{ ...record, archivedAt: new Date("2026-10-01T08:30:00.000Z") }]),
    ).items;
    expect(row!.archivedAt).toBe("2026-10-01T08:30:00.000Z");
  });

  it("carries no storage location, checksum, uploader, error text or drafted item — whatever the record holds", () => {
    const built = buildAdminImportPage(page([record]));
    expect(Object.keys(built.items[0]!).sort()).toEqual([
      "archivedAt",
      "attemptCount",
      "createCount",
      "createdAt",
      "id",
      "moveCount",
      "originalFilename",
      "reviewCount",
      "skippedCount",
      "status",
      "totalRows",
      "unchangedCount",
      "updateCount",
    ]);
    const text = JSON.stringify(built);
    for (const secret of [
      "polyglot-private-bucket",
      "private-key",
      "deadbeef",
      "S3_READ_FAILED",
      "private bucket",
      record.uploadedByUserId,
      record.languageId,
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("builds a page the contract accepts, and the contract would strip anything extra", () => {
    const built = buildAdminImportPage(page([record]));
    expect(adminImportPageSchema.safeParse(built).success).toBe(true);
    const sneaky = {
      ...built,
      items: [{ ...built.items[0]!, s3Key: record.s3Key }],
    };
    expect(adminImportPageSchema.parse(sneaky).items[0]).not.toHaveProperty(
      "s3Key",
    );
  });

  it("handles an empty history", () => {
    expect(
      buildAdminImportPage({
        items: [],
        nextCursor: null,
        hasPreviousPage: false,
        previousCursor: null,
      }),
    ).toEqual({
      items: [],
      nextCursor: null,
      hasPreviousPage: false,
      previousCursor: null,
    });
  });
});

describe("who has the dictionary and decks resources (spec 26 Units 9-10)", () => {
  it.each(USER_ROLES)(
    "gives %s the dictionary resource only if they may author",
    (role) => {
      const { resources } = buildAdminPermissions({ role });
      expect(Object.hasOwn(resources, "dictionary")).toBe(
        role === "admin" || role === "writer",
      );
    },
  );

  it.each(USER_ROLES)(
    "gives %s the decks resource only if they are an Admin — absent, not empty, for anyone else",
    (role) => {
      const { resources } = buildAdminPermissions({ role });
      expect(Object.hasOwn(resources, "decks")).toBe(role === "admin");
    },
  );
});

describe("buildAdminDictionaryPage (spec 26 Unit 9)", () => {
  const row = (overrides: Partial<MappingQueueRow> = {}): MappingQueueRow => ({
    vocabularyItemId: "90000000-0000-4000-8000-000000000001",
    displayWord: "el gato",
    translation: "cat",
    levelNumber: 1,
    groupName: "Animals",
    curriculumPartOfSpeech: "noun",
    lookupForm: "gato",
    matchStatus: "auto_matched",
    confidence: "high",
    reviewReason: null,
    manualLock: false,
    entryId: "a0000000-0000-4000-8000-000000000001",
    entryLemma: "gato",
    entryPartOfSpeech: "noun",
    regionalStatus: "recognized",
    ...overrides,
  });
  const counts = {
    unmatched: 3,
    source_data_not_imported: 1,
    auto_matched: 20,
    review_required: 4,
    manual: 9,
    no_mapping: 2,
  };
  const build = (rows: MappingQueueRow[], total = rows.length) =>
    buildAdminDictionaryPage({
      page: { rows, total },
      counts,
      regionCode: "es-MX",
      regionCodes: ["es-MX", "es"],
    });

  it("is a page the contract accepts", () => {
    expect(() => adminDictionaryPageSchema.parse(build([row()]))).not.toThrow();
  });

  it("names a word by its learning-item id, and carries the total and the region as given", () => {
    const page = build([row()], 130);
    expect(page.items[0]!.id).toBe("90000000-0000-4000-8000-000000000001");
    expect(page.total).toBe(130);
    expect(page.regionCode).toBe("es-MX");
    expect(page.regionCodes).toEqual(["es-MX", "es"]);
  });

  it("leaves out the dictionary entry's id and the curriculum's part of speech — field by field, never a spread", () => {
    const [item] = build([row()]).items;
    expect(item).not.toHaveProperty("entryId");
    expect(item).not.toHaveProperty("vocabularyItemId");
    expect(item).not.toHaveProperty("curriculumPartOfSpeech");
    expect(Object.keys(item!).sort()).toEqual([
      "confidence",
      "confirmable",
      "displayWord",
      "entryLemma",
      "entryPartOfSpeech",
      "groupName",
      "id",
      "levelNumber",
      "lookupForm",
      "manualLock",
      "matchStatus",
      "regionalStatus",
      "reviewReason",
      "translation",
    ]);
  });

  it.each([
    [
      "a candidate that is not confirmed",
      { matchStatus: "auto_matched" },
      true,
    ],
    ["a candidate that needs review", { matchStatus: "review_required" }, true],
    ["a confirmed (manual) match", { matchStatus: "manual" }, false],
    [
      "a word with no candidate",
      { entryId: null, matchStatus: "unmatched" },
      false,
    ],
    [
      "a word nothing has looked at",
      { entryId: null, matchStatus: null },
      false,
    ],
  ] as const)("says %s is confirmable: %s", (_name, override, confirmable) => {
    expect(
      build([row(override as Partial<MappingQueueRow>)]).items[0]!.confirmable,
    ).toBe(confirmable);
  });

  it("keeps the counts to the six it names, whatever else the service returned", () => {
    const page = buildAdminDictionaryPage({
      page: { rows: [], total: 0 },
      counts: { ...counts, internal: 99 } as typeof counts,
      regionCode: null,
      regionCodes: [],
    });
    expect(page.counts).toEqual(counts);
    expect(page.regionCode).toBeNull();
  });
});

describe("buildAdminDeckList (spec 26 Unit 10)", () => {
  const deck = (n: number, overrides: Record<string, unknown> = {}) => ({
    id: `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Deck ${String(n).padStart(3, "0")}`,
    description: "Colors and shapes" as string | null,
    itemCount: 12,
    availability: "theme" as const,
    gateLevelNumber: null as number | null,
    ...overrides,
  });

  it("is a list the contract accepts, by name then id, whatever order the read came in", () => {
    const list = buildAdminDeckList([deck(3), deck(1), deck(2)]);
    expect(() => adminDeckListSchema.parse(list)).not.toThrow();
    expect(list.items.map((item) => item.name)).toEqual([
      "Deck 001",
      "Deck 002",
      "Deck 003",
    ]);
    expect(list.truncated).toBe(false);
  });

  it("orders decks of the same name by id, so the order is total", () => {
    const list = buildAdminDeckList([
      deck(2, { name: "Same" }),
      deck(1, { name: "Same" }),
    ]);
    expect(list.items.map((item) => item.id)).toEqual([
      "d0000000-0000-4000-8000-000000000001",
      "d0000000-0000-4000-8000-000000000002",
    ]);
  });

  it("is built field by field — an owner, a gate level's id and a kind never reach it", () => {
    const list = buildAdminDeckList([
      {
        ...deck(1),
        ownerUserId: "someone",
        gateLevelId: "a-level",
        kind: "polyglot",
      } as ReturnType<typeof deck>,
    ]);
    expect(Object.keys(list.items[0]!).sort()).toEqual([
      "availability",
      "description",
      "gateLevelNumber",
      "id",
      "itemCount",
      "name",
    ]);
  });

  it("cuts at the bound and says so", () => {
    const list = buildAdminDeckList(
      Array.from({ length: DECK_LIST_MAX + 3 }, (_, n) => deck(n + 1)),
    );
    expect(list.items).toHaveLength(DECK_LIST_MAX);
    expect(list.truncated).toBe(true);
    // The first by name — not whichever the read happened to return first.
    expect(list.items[0]!.name).toBe("Deck 001");
  });

  it("carries a gated deck's level number, and nothing for a theme deck", () => {
    const [gated, theme] = buildAdminDeckList([
      deck(1, { availability: "level", gateLevelNumber: 4 }),
      deck(2),
    ]).items;
    expect(gated).toMatchObject({ availability: "level", gateLevelNumber: 4 });
    expect(theme).toMatchObject({
      availability: "theme",
      gateLevelNumber: null,
    });
  });
});
