import { describe, expect, it } from "vitest";

import { USER_ROLES } from "@/domains/users";

import {
  ADMIN_CEFR_LEVELS,
  CURRICULUM_STATUSES,
  USER_LIST_MAX_PAGE_SIZE,
  USER_LIST_PAGE_SIZE,
  USER_ROLE_REASON_MAX,
  adminGroupCreateRequestSchema,
  adminGroupListQuerySchema,
  adminGroupPathSchema,
  adminGroupRowSchema,
  adminGroupUpdateRequestSchema,
  adminLevelCreateRequestSchema,
  adminLevelListQuerySchema,
  adminLevelPathSchema,
  adminLevelRowSchema,
  adminLevelUpdateRequestSchema,
  adminUserListQuerySchema,
  adminUserPageSchema,
  adminUserPathSchema,
  adminUserRoleChangeRequestSchema,
  adminUserRoleChangeResultSchema,
  adminUserRowSchema,
} from "./admin-api-contract";

const LANGUAGE = "10000000-0000-4000-8000-000000000001";
const KEY = "20000000-0000-4000-8000-000000000002";
const LEVEL = "30000000-0000-4000-8000-000000000003";

/**
 * Spec 26 Unit 4's "level validation unchanged": the rules below are the ones
 * the Server Actions this contract replaces enforced (`createLevelAction`:
 * a whole number of at least 1 and an optional trimmed, non-empty name;
 * `updateLevelAction`: optional name / status / CEFR band, where `null`
 * clears a name or band and leaving a field out leaves it alone), now stated
 * as cases rather than as an implementation detail.
 */
describe("adminLevelCreateRequestSchema", () => {
  const base = { languageId: LANGUAGE, levelNumber: 4, idempotencyKey: KEY };

  it("accepts the smallest request, and a name", () => {
    expect(adminLevelCreateRequestSchema.safeParse(base).success).toBe(true);
    expect(
      adminLevelCreateRequestSchema.parse({ ...base, name: "Colors" }).name,
    ).toBe("Colors");
  });

  it("treats a null name as no name, and trims one that is given", () => {
    expect(
      adminLevelCreateRequestSchema.parse({ ...base, name: null }).name,
    ).toBeNull();
    expect(
      adminLevelCreateRequestSchema.parse({ ...base, name: "  Colors  " }).name,
    ).toBe("Colors");
  });

  it.each([1, 2, 50, 51, 999, 2_147_483_647])(
    "accepts level number %s (the rule is 'a whole number of at least 1')",
    (levelNumber) => {
      expect(
        adminLevelCreateRequestSchema.safeParse({ ...base, levelNumber })
          .success,
      ).toBe(true);
    },
  );

  it.each([
    ["zero", 0],
    ["negative", -3],
    ["a fraction", 1.5],
    ["text", "4"],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["too large for the database column", 2_147_483_648],
    ["null", null],
  ])("refuses a level number that is %s", (_name, levelNumber) => {
    expect(
      adminLevelCreateRequestSchema.safeParse({ ...base, levelNumber }).success,
    ).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["over 200 characters", "x".repeat(201)],
    ["a number", 7],
  ])("refuses a name that is %s", (_label, name) => {
    expect(
      adminLevelCreateRequestSchema.safeParse({ ...base, name }).success,
    ).toBe(false);
  });

  it.each([
    ["a status", { status: "published" }],
    ["an actor", { actorUserId: LEVEL }],
    ["a CEFR band", { cefrLevel: "A1" }],
    ["anything else", { publishAll: true }],
  ])("refuses a body that also carries %s", (_label, extra) => {
    expect(
      adminLevelCreateRequestSchema.safeParse({ ...base, ...extra }).success,
    ).toBe(false);
  });

  it.each(["languageId", "levelNumber", "idempotencyKey"])(
    "requires %s",
    (field) => {
      const rest: Record<string, unknown> = { ...base };
      delete rest[field];
      expect(adminLevelCreateRequestSchema.safeParse(rest).success).toBe(false);
    },
  );

  it("requires UUIDs for the language and the key", () => {
    expect(
      adminLevelCreateRequestSchema.safeParse({
        ...base,
        languageId: "lang-es",
      }).success,
    ).toBe(false);
    expect(
      adminLevelCreateRequestSchema.safeParse({
        ...base,
        idempotencyKey: "retry-1",
      }).success,
    ).toBe(false);
  });
});

describe("adminLevelUpdateRequestSchema", () => {
  const withKey = { idempotencyKey: KEY };

  it("accepts any one field on its own", () => {
    for (const change of [
      { name: "Renamed" },
      { status: "published" },
      { cefrLevel: "B2" },
    ]) {
      expect(
        adminLevelUpdateRequestSchema.safeParse({ ...withKey, ...change })
          .success,
      ).toBe(true);
    }
  });

  it("accepts all of them together", () => {
    expect(
      adminLevelUpdateRequestSchema.safeParse({
        ...withKey,
        name: "Renamed",
        status: "pending",
        cefrLevel: "C1",
      }).success,
    ).toBe(true);
  });

  it("distinguishes 'clear it' (null) from 'leave it alone' (omitted)", () => {
    const cleared = adminLevelUpdateRequestSchema.parse({
      ...withKey,
      name: null,
      cefrLevel: null,
    });
    expect(cleared.name).toBeNull();
    expect(cleared.cefrLevel).toBeNull();

    const untouched = adminLevelUpdateRequestSchema.parse({
      ...withKey,
      status: "draft",
    });
    // Absent, not null: the service must leave these two columns alone.
    expect("name" in untouched).toBe(false);
    expect("cefrLevel" in untouched).toBe(false);
  });

  it("refuses an update that changes nothing", () => {
    expect(adminLevelUpdateRequestSchema.safeParse(withKey).success).toBe(
      false,
    );
  });

  it.each(CURRICULUM_STATUSES)("accepts the status %s", (status) => {
    expect(
      adminLevelUpdateRequestSchema.safeParse({ ...withKey, status }).success,
    ).toBe(true);
  });

  it.each(ADMIN_CEFR_LEVELS)("accepts the CEFR band %s", (cefrLevel) => {
    expect(
      adminLevelUpdateRequestSchema.safeParse({ ...withKey, cefrLevel })
        .success,
    ).toBe(true);
  });

  it.each([
    ["a status that is not one", { status: "live" }],
    ["a null status (a status cannot be cleared)", { status: null }],
    ["a CEFR band that does not exist", { cefrLevel: "A3" }],
    ["a lower-case band", { cefrLevel: "a1" }],
    ["an empty name (send null to clear it)", { name: "" }],
    ["a name of only spaces", { name: "   " }],
    ["a name over 200 characters", { name: "x".repeat(201) }],
  ])("refuses %s", (_label, change) => {
    expect(
      adminLevelUpdateRequestSchema.safeParse({ ...withKey, ...change })
        .success,
    ).toBe(false);
  });

  it.each([
    ["a different level in the body", { levelId: LEVEL }],
    ["a language", { languageId: LANGUAGE }],
    ["a level number", { levelNumber: 9 }],
    ["an actor", { actorUserId: LEVEL }],
  ])("refuses a body that names %s", (_label, extra) => {
    expect(
      adminLevelUpdateRequestSchema.safeParse({
        ...withKey,
        name: "x",
        ...extra,
      }).success,
    ).toBe(false);
  });

  it("requires an idempotency key that is a UUID", () => {
    expect(adminLevelUpdateRequestSchema.safeParse({ name: "x" }).success).toBe(
      false,
    );
    expect(
      adminLevelUpdateRequestSchema.safeParse({
        name: "x",
        idempotencyKey: "retry-1",
      }).success,
    ).toBe(false);
  });
});

describe("adminLevelListQuerySchema", () => {
  it("needs exactly a language", () => {
    expect(
      adminLevelListQuerySchema.safeParse({ language: LANGUAGE }).success,
    ).toBe(true);
    expect(adminLevelListQuerySchema.safeParse({}).success).toBe(false);
    expect(
      adminLevelListQuerySchema.safeParse({ language: "lang-es" }).success,
    ).toBe(false);
  });

  it.each(["sort", "page", "limit", "cursor", "status"])(
    "refuses an unsupported %s parameter instead of ignoring it",
    (param) => {
      expect(
        adminLevelListQuerySchema.safeParse({
          language: LANGUAGE,
          [param]: "1",
        }).success,
      ).toBe(false);
    },
  );
});

describe("adminLevelPathSchema", () => {
  it("accepts a UUID and nothing else", () => {
    expect(adminLevelPathSchema.safeParse({ levelId: LEVEL }).success).toBe(
      true,
    );
    expect(adminLevelPathSchema.safeParse({ levelId: "1; drop" }).success).toBe(
      false,
    );
    expect(adminLevelPathSchema.safeParse({}).success).toBe(false);
  });
});

describe("adminLevelRowSchema", () => {
  const row = {
    id: LEVEL,
    levelNumber: 1,
    name: null,
    status: "draft",
    cefrLevel: null,
    vocabularyItems: 0,
    grammarItems: 0,
    vocabularyGroups: 0,
  };

  it("accepts a bare level and one that holds a lot", () => {
    expect(adminLevelRowSchema.safeParse(row).success).toBe(true);
    expect(
      adminLevelRowSchema.safeParse({
        ...row,
        name: "Basics",
        status: "published",
        cefrLevel: "A1",
        vocabularyItems: 450,
        grammarItems: 120,
        vocabularyGroups: 40,
      }).success,
    ).toBe(true);
  });

  it("refuses a negative count", () => {
    expect(
      adminLevelRowSchema.safeParse({ ...row, grammarItems: -1 }).success,
    ).toBe(false);
  });
});

/**
 * Spec 26 Unit 5's "scoped group records": the rules of the Server Actions the
 * group endpoints replace (`createVocabularyGroupAction`: a level, a language,
 * a trimmed non-empty name; `updateVocabularyGroupAction`: an optional name
 * and status), plus what is deliberately *not* a field — a position, which the
 * server alone assigns, and a level, which a group does not move between here.
 */
describe("adminGroupCreateRequestSchema", () => {
  const base = {
    languageId: LANGUAGE,
    levelId: LEVEL,
    name: "Colors",
    idempotencyKey: KEY,
  };

  it("accepts a name, a level and a language", () => {
    expect(adminGroupCreateRequestSchema.safeParse(base).success).toBe(true);
  });

  it("trims the name", () => {
    expect(
      adminGroupCreateRequestSchema.parse({ ...base, name: "  Colors  " }).name,
    ).toBe("Colors");
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["over 200 characters", "x".repeat(201)],
    ["null", null],
    ["a number", 7],
  ])("refuses a name that is %s", (_label, name) => {
    expect(
      adminGroupCreateRequestSchema.safeParse({ ...base, name }).success,
    ).toBe(false);
  });

  it.each(["languageId", "levelId", "name", "idempotencyKey"])(
    "requires %s",
    (field) => {
      const rest: Record<string, unknown> = { ...base };
      delete rest[field];
      expect(adminGroupCreateRequestSchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each([
    ["a position — the server assigns it", { position: 1 }],
    ["a status", { status: "published" }],
    ["an actor", { actorUserId: LEVEL }],
    ["anything else", { publishAll: true }],
  ])("refuses a body that also carries %s", (_label, extra) => {
    expect(
      adminGroupCreateRequestSchema.safeParse({ ...base, ...extra }).success,
    ).toBe(false);
  });

  it("requires UUIDs for the language, the level, and the key", () => {
    for (const bad of [
      { languageId: "lang-es" },
      { levelId: "level-1" },
      { idempotencyKey: "retry-1" },
    ]) {
      expect(
        adminGroupCreateRequestSchema.safeParse({ ...base, ...bad }).success,
      ).toBe(false);
    }
  });
});

describe("adminGroupUpdateRequestSchema", () => {
  const withKey = { idempotencyKey: KEY };

  it("accepts a name, a status, or both", () => {
    for (const change of [
      { name: "Renamed" },
      { status: "archived" },
      { name: "Renamed", status: "published" },
    ]) {
      expect(
        adminGroupUpdateRequestSchema.safeParse({ ...withKey, ...change })
          .success,
      ).toBe(true);
    }
  });

  it("trims the name, and leaves an omitted field out entirely", () => {
    const parsed = adminGroupUpdateRequestSchema.parse({
      ...withKey,
      name: "  Renamed ",
    });
    expect(parsed.name).toBe("Renamed");
    // Omitted, not null: the service leaves the status alone.
    expect("status" in parsed).toBe(false);
  });

  it("refuses an update that changes nothing", () => {
    expect(adminGroupUpdateRequestSchema.safeParse(withKey).success).toBe(
      false,
    );
  });

  it.each(CURRICULUM_STATUSES)("accepts the status %s", (status) => {
    expect(
      adminGroupUpdateRequestSchema.safeParse({ ...withKey, status }).success,
    ).toBe(true);
  });

  it.each([
    ["a status that is not one", { status: "live" }],
    ["a null status", { status: null }],
    ["a null name — a group always has one", { name: null }],
    ["an empty name", { name: "" }],
    ["a name of only spaces", { name: "   " }],
    ["a name over 200 characters", { name: "x".repeat(201) }],
  ])("refuses %s", (_label, change) => {
    expect(
      adminGroupUpdateRequestSchema.safeParse({ ...withKey, ...change })
        .success,
    ).toBe(false);
  });

  it.each([
    ["a position — ordering is the reorder tool's", { position: 3 }],
    ["a level — a group is not moved here", { levelId: LEVEL }],
    ["a different group in the body", { groupId: LEVEL }],
    ["a language", { languageId: LANGUAGE }],
    ["an actor", { actorUserId: LEVEL }],
  ])("refuses a body that names %s", (_label, extra) => {
    expect(
      adminGroupUpdateRequestSchema.safeParse({
        ...withKey,
        name: "x",
        ...extra,
      }).success,
    ).toBe(false);
  });

  it("requires an idempotency key that is a UUID", () => {
    expect(adminGroupUpdateRequestSchema.safeParse({ name: "x" }).success).toBe(
      false,
    );
    expect(
      adminGroupUpdateRequestSchema.safeParse({
        name: "x",
        idempotencyKey: "retry-1",
      }).success,
    ).toBe(false);
  });
});

describe("adminGroupListQuerySchema", () => {
  it("needs exactly a language and a level — a group's position only means something within its level", () => {
    expect(
      adminGroupListQuerySchema.safeParse({ language: LANGUAGE, level: LEVEL })
        .success,
    ).toBe(true);
    expect(
      adminGroupListQuerySchema.safeParse({ language: LANGUAGE }).success,
    ).toBe(false);
    expect(adminGroupListQuerySchema.safeParse({ level: LEVEL }).success).toBe(
      false,
    );
    expect(
      adminGroupListQuerySchema.safeParse({ language: "es", level: LEVEL })
        .success,
    ).toBe(false);
  });

  it.each(["sort", "page", "limit", "cursor", "status", "mode"])(
    "refuses an unsupported %s parameter instead of ignoring it",
    (param) => {
      expect(
        adminGroupListQuerySchema.safeParse({
          language: LANGUAGE,
          level: LEVEL,
          [param]: "1",
        }).success,
      ).toBe(false);
    },
  );
});

describe("adminGroupPathSchema", () => {
  it("accepts a UUID and nothing else", () => {
    expect(adminGroupPathSchema.safeParse({ groupId: LEVEL }).success).toBe(
      true,
    );
    expect(adminGroupPathSchema.safeParse({ groupId: "1; drop" }).success).toBe(
      false,
    );
    expect(adminGroupPathSchema.safeParse({}).success).toBe(false);
  });
});

describe("adminGroupRowSchema", () => {
  const row = {
    id: LEVEL,
    levelId: LANGUAGE,
    name: "Colors",
    status: "published",
    position: 2,
  };

  it("accepts a group in every status", () => {
    for (const status of CURRICULUM_STATUSES) {
      expect(adminGroupRowSchema.safeParse({ ...row, status }).success).toBe(
        true,
      );
    }
  });

  it("refuses a position that is not a whole number", () => {
    expect(
      adminGroupRowSchema.safeParse({ ...row, position: 1.5 }).success,
    ).toBe(false);
  });
});

/**
 * Spec 26 Unit 6 — who may be listed, and what a role change may carry. What
 * matters most is what is *not* a field: an actor, another account, a Clerk id,
 * a sandbox flag. Who is asking is the session; who is being changed is the path.
 */
const USER = "40000000-0000-4000-8000-000000000004";
/** A version token: the row's `updated_at`, with its microseconds. */
const TOKEN = "2026-03-02T09:30:15.123456Z";

describe("adminUserListQuerySchema", () => {
  it("accepts no parameters at all, and defaults the page size", () => {
    expect(adminUserListQuerySchema.parse({}).limit).toBe(USER_LIST_PAGE_SIZE);
  });

  it("accepts a search and a cursor, and trims the search", () => {
    expect(
      adminUserListQuerySchema.parse({ search: "  ana  ", cursor: "abc" }),
    ).toMatchObject({ search: "ana", cursor: "abc" });
  });

  it("reads the limit from a query string's text", () => {
    expect(adminUserListQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it.each([
    ["an empty search", { search: "" }],
    ["a search of only spaces", { search: "   " }],
    ["an over-long search", { search: "x".repeat(101) }],
    ["an empty cursor", { cursor: "" }],
    ["an over-long cursor", { cursor: "x".repeat(513) }],
    ["a limit of zero", { limit: "0" }],
    ["a limit over the cap", { limit: String(USER_LIST_MAX_PAGE_SIZE + 1) }],
    ["a fractional limit", { limit: "2.5" }],
  ])("refuses %s", (_label, query) => {
    expect(adminUserListQuerySchema.safeParse(query).success).toBe(false);
  });

  // Not ignored: a parameter this endpoint does not implement is a 422. In
  // particular there is no way to ask for sandbox personas, or to filter by role.
  it.each([
    ["a sort", { sort: "name" }],
    ["a page number", { page: "2" }],
    ["a role filter", { role: "admin" }],
    ["a request for sandbox personas", { includeSandbox: "true" }],
    ["a language", { language: LANGUAGE }],
  ])("refuses %s", (_label, query) => {
    expect(adminUserListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("adminUserRowSchema and adminUserPageSchema", () => {
  const row = {
    id: USER,
    displayName: "Ana Lopez",
    username: "ana_lopez",
    role: "writer",
    createdAt: "2026-03-01T12:00:00.000100Z",
    updatedAt: TOKEN,
  };

  it("accepts a row, with microsecond timestamps", () => {
    expect(adminUserRowSchema.safeParse(row).success).toBe(true);
  });

  it("accepts an account that has set neither a display name nor a username", () => {
    expect(
      adminUserRowSchema.safeParse({
        ...row,
        displayName: null,
        username: null,
      }).success,
    ).toBe(true);
  });

  it.each(USER_ROLES)("accepts the %s role", (role) => {
    expect(adminUserRowSchema.safeParse({ ...row, role }).success).toBe(true);
  });

  it("refuses a role that is not one of the five", () => {
    for (const role of ["superadmin", "", "ADMIN", null]) {
      expect(adminUserRowSchema.safeParse({ ...row, role }).success).toBe(
        false,
      );
    }
  });

  it("refuses a timestamp that is not an ISO instant — a token must be one", () => {
    for (const updatedAt of ["yesterday", "", "2026-03-02", null]) {
      expect(adminUserRowSchema.safeParse({ ...row, updatedAt }).success).toBe(
        false,
      );
    }
  });

  it("drops anything a row was not meant to carry, rather than passing it on", () => {
    const parsed = adminUserRowSchema.parse({
      ...row,
      clerkUserId: "user_must_never_appear",
      email: "private@example.com",
      isSandbox: false,
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "createdAt",
      "displayName",
      "id",
      "role",
      "updatedAt",
      "username",
    ]);
  });

  it("describes a page with cursors and no total", () => {
    const page = {
      items: [row],
      nextCursor: "n",
      hasPreviousPage: true,
      previousCursor: null,
    };
    expect(adminUserPageSchema.safeParse(page).success).toBe(true);
    expect(adminUserPageSchema.parse({ ...page, total: 9 })).not.toHaveProperty(
      "total",
    );
  });
});

describe("adminUserRoleChangeRequestSchema", () => {
  const base = {
    role: "writer",
    expectedUpdatedAt: TOKEN,
    idempotencyKey: KEY,
  };

  it("accepts a role, the version token it was read at, and a key", () => {
    expect(adminUserRoleChangeRequestSchema.safeParse(base).success).toBe(true);
  });

  it.each(USER_ROLES)("accepts the %s role", (role) => {
    expect(
      adminUserRoleChangeRequestSchema.safeParse({ ...base, role }).success,
    ).toBe(true);
  });

  it.each([
    ["superadmin"],
    [""],
    ["ADMIN"],
    ["Admin"],
    [null],
    [["admin"]],
    [{ role: "admin" }],
  ])("refuses the role %j — the role is one of the five, exactly", (role) => {
    expect(
      adminUserRoleChangeRequestSchema.safeParse({ ...base, role }).success,
    ).toBe(false);
  });

  it("accepts a token with any sub-second precision, and refuses one that is not an instant", () => {
    for (const expectedUpdatedAt of [
      "2026-03-02T09:30:15Z",
      "2026-03-02T09:30:15.123Z",
      TOKEN,
    ]) {
      expect(
        adminUserRoleChangeRequestSchema.safeParse({
          ...base,
          expectedUpdatedAt,
        }).success,
      ).toBe(true);
    }
    for (const expectedUpdatedAt of ["now", "", 0, null, "2026-03-02"]) {
      expect(
        adminUserRoleChangeRequestSchema.safeParse({
          ...base,
          expectedUpdatedAt,
        }).success,
      ).toBe(false);
    }
  });

  it("makes the version token mandatory: there is no unconditional role change", () => {
    const rest: Record<string, unknown> = { ...base };
    delete rest.expectedUpdatedAt;
    expect(adminUserRoleChangeRequestSchema.safeParse(rest).success).toBe(
      false,
    );
  });

  it("requires a role and a key", () => {
    for (const field of ["role", "idempotencyKey"]) {
      const rest: Record<string, unknown> = { ...base };
      delete rest[field];
      expect(adminUserRoleChangeRequestSchema.safeParse(rest).success).toBe(
        false,
      );
    }
  });

  it("trims an optional reason, and refuses an empty, blank or over-long one", () => {
    expect(
      adminUserRoleChangeRequestSchema.parse({ ...base, reason: "  Joined  " })
        .reason,
    ).toBe("Joined");
    for (const reason of [
      "",
      "   ",
      "x".repeat(USER_ROLE_REASON_MAX + 1),
      null,
    ]) {
      expect(
        adminUserRoleChangeRequestSchema.safeParse({ ...base, reason }).success,
      ).toBe(false);
    }
    expect(
      adminUserRoleChangeRequestSchema.safeParse({
        ...base,
        reason: "x".repeat(USER_ROLE_REASON_MAX),
      }).success,
    ).toBe(true);
  });

  it("requires a UUID for the key", () => {
    expect(
      adminUserRoleChangeRequestSchema.safeParse({
        ...base,
        idempotencyKey: "retry-1",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["an actor", { actorUserId: USER }],
    ["another account", { userId: USER }],
    ["a target", { targetUserId: USER }],
    ["a Clerk id", { clerkUserId: "user_123" }],
    ["a sandbox flag", { isSandbox: true }],
    ["a second role", { roles: ["admin", "writer"] }],
    ["a progress field", { srsStage: 5 }],
    ["anything else", { bulk: true }],
  ])("refuses a body that also carries %s", (_label, extra) => {
    expect(
      adminUserRoleChangeRequestSchema.safeParse({ ...base, ...extra }).success,
    ).toBe(false);
  });
});

describe("adminUserRoleChangeResultSchema and adminUserPathSchema", () => {
  it("describes the new role and the account's next version token", () => {
    expect(
      adminUserRoleChangeResultSchema.safeParse({
        userId: USER,
        role: "admin",
        updatedAt: TOKEN,
      }).success,
    ).toBe(true);
    expect(
      adminUserRoleChangeResultSchema.safeParse({ userId: USER, role: "admin" })
        .success,
    ).toBe(false);
  });

  it("requires a UUID in the path", () => {
    expect(adminUserPathSchema.safeParse({ userId: USER }).success).toBe(true);
    for (const userId of ["not-an-id", "", "../1", USER + "x"]) {
      expect(adminUserPathSchema.safeParse({ userId }).success).toBe(false);
    }
  });
});
