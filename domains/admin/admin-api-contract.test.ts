import { describe, expect, it } from "vitest";

import {
  MATCH_CONFIDENCE_LABELS,
  MATCH_STATUS_LABELS,
  MAPPING_REVIEW_REASONS,
  REGIONAL_STATUS_LABELS,
  REVIEW_REASON_LABELS,
} from "@/domains/lexicon";
import { USER_ROLES } from "@/domains/users";

import { ADMIN_AUDIT_ACTIONS } from "./audit-types";

import {
  ADMIN_CEFR_LEVELS,
  CURRICULUM_BULK_ITEM_LIMIT,
  CURRICULUM_STATUSES,
  DECK_AVAILABILITIES,
  DECK_LIST_MAX,
  DICTIONARY_LIST_MAX_PAGE_SIZE,
  DICTIONARY_LIST_PAGE_SIZE,
  IMPORT_DELETE_CONFIRMATION,
  IMPORT_LIST_MAX_PAGE_SIZE,
  IMPORT_LIST_PAGE_SIZE,
  IMPORT_STATUSES,
  LOG_LIST_MAX_PAGE_SIZE,
  LOG_LIST_PAGE_SIZE,
  MAPPING_CONFIDENCES,
  MAPPING_MATCH_STATUSES,
  MAPPING_PARTS_OF_SPEECH,
  MAPPING_REGIONAL_STATUSES,
  MAPPING_REVIEW_REASON_CODES,
  USER_LIST_MAX_PAGE_SIZE,
  USER_LIST_PAGE_SIZE,
  USER_ROLE_REASON_MAX,
  adminCurriculumBulkArchiveRequestSchema,
  adminCurriculumBulkArchiveResultSchema,
  adminCurriculumBulkMoveRequestSchema,
  adminCurriculumBulkMoveResultSchema,
  adminCurriculumBulkPublishRequestSchema,
  adminCurriculumBulkPublishResultSchema,
  adminDeckListQuerySchema,
  adminDeckListSchema,
  adminDeckRowSchema,
  adminDictionaryCountsSchema,
  adminDictionaryListQuerySchema,
  adminDictionaryPageSchema,
  adminDictionaryRowSchema,
  adminGroupCreateRequestSchema,
  adminGroupListQuerySchema,
  adminGroupPathSchema,
  adminGroupRowSchema,
  adminGroupUpdateRequestSchema,
  adminImportArchiveRequestSchema,
  adminImportCommandResultSchema,
  adminImportDeleteRequestSchema,
  adminImportListQuerySchema,
  adminImportPageSchema,
  adminImportPathSchema,
  adminImportRestoreRequestSchema,
  adminImportRowSchema,
  adminLevelCreateRequestSchema,
  adminLevelListQuerySchema,
  adminLevelPathSchema,
  adminLogListQuerySchema,
  adminLogPageSchema,
  adminLogRowSchema,
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

/**
 * Spec 26 Unit 7: the three bulk curriculum commands share one rule for the
 * items they name — one to `CURRICULUM_BULK_ITEM_LIMIT`, each once — and one
 * body shape: the language they act in, the items, and an idempotency key.
 * Nothing else is accepted: above all, no actor and no role.
 */
const ITEM_A = "40000000-0000-4000-8000-00000000000a";
const ITEM_B = "40000000-0000-4000-8000-00000000000b";
const GROUP = "50000000-0000-4000-8000-000000000005";

function itemIds(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) =>
      `40000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
  );
}

describe.each([
  ["publish", adminCurriculumBulkPublishRequestSchema],
  ["archive", adminCurriculumBulkArchiveRequestSchema],
])("the bulk %s request", (_name, schema) => {
  const base = {
    languageId: LANGUAGE,
    itemIds: [ITEM_A, ITEM_B],
    idempotencyKey: KEY,
  };

  it("accepts a language, its items and a key", () => {
    expect(schema.parse(base)).toEqual(base);
  });

  it("accepts exactly the bound, and refuses one more", () => {
    expect(CURRICULUM_BULK_ITEM_LIMIT).toBe(100);
    expect(
      schema.safeParse({
        ...base,
        itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT),
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT + 1),
      }).success,
    ).toBe(false);
  });

  it("refuses no items", () => {
    expect(schema.safeParse({ ...base, itemIds: [] }).success).toBe(false);
  });

  it("refuses an item named twice, whatever its letter case", () => {
    expect(
      schema.safeParse({ ...base, itemIds: [ITEM_A, ITEM_A] }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        itemIds: [ITEM_A, ITEM_A.toUpperCase()],
      }).success,
    ).toBe(false);
  });

  it.each(["not-an-id", "", "../1", ITEM_A + "x", 7, null])(
    "refuses %j as an item id",
    (id) => {
      expect(schema.safeParse({ ...base, itemIds: [ITEM_A, id] }).success).toBe(
        false,
      );
    },
  );

  it("refuses items that are not a list", () => {
    expect(schema.safeParse({ ...base, itemIds: ITEM_A }).success).toBe(false);
    expect(schema.safeParse({ ...base, itemIds: undefined }).success).toBe(
      false,
    );
  });

  it.each(["languageId", "idempotencyKey"] as const)(
    "needs a %s that is a UUID",
    (field) => {
      expect(schema.safeParse({ ...base, [field]: undefined }).success).toBe(
        false,
      );
      expect(schema.safeParse({ ...base, [field]: "nope" }).success).toBe(
        false,
      );
    },
  );

  it("accepts nothing it does not name — an actor, a role, a status", () => {
    for (const extra of [
      { actorUserId: "someone" },
      { role: "admin" },
      { status: "published" },
      { learningItemIds: [ITEM_A] },
      { levelId: LEVEL },
    ]) {
      expect(schema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
  });
});

describe("the bulk move request", () => {
  const base = {
    languageId: LANGUAGE,
    itemIds: [ITEM_A, ITEM_B],
    idempotencyKey: KEY,
  };
  const schema = adminCurriculumBulkMoveRequestSchema;

  it("accepts a level, a group, or both", () => {
    expect(schema.safeParse({ ...base, levelId: LEVEL }).success).toBe(true);
    expect(schema.safeParse({ ...base, groupId: GROUP }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, levelId: LEVEL, groupId: GROUP }).success,
    ).toBe(true);
  });

  it("refuses a move that names no target", () => {
    const result = schema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "A move must name a level, a group, or both.",
      );
    }
  });

  it.each([
    ["levelId", "nope"],
    ["groupId", "nope"],
    ["levelId", ""],
    ["groupId", null],
  ])("refuses %s %j", (field, value) => {
    expect(
      schema.safeParse({ ...base, levelId: LEVEL, [field]: value }).success,
    ).toBe(false);
  });

  it("holds the same bound and the same uniqueness as the other commands", () => {
    expect(
      schema.safeParse({
        ...base,
        levelId: LEVEL,
        itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT),
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        levelId: LEVEL,
        itemIds: itemIds(CURRICULUM_BULK_ITEM_LIMIT + 1),
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, levelId: LEVEL, itemIds: [ITEM_A, ITEM_A] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, levelId: LEVEL, itemIds: [] }).success,
    ).toBe(false);
  });

  it("accepts nothing it does not name", () => {
    expect(
      schema.safeParse({ ...base, levelId: LEVEL, actorUserId: "x" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...base, levelId: LEVEL, vocabularyGroupId: GROUP })
        .success,
    ).toBe(false);
  });
});

describe("the bulk results", () => {
  it("describe what was done, item by item", () => {
    expect(
      adminCurriculumBulkPublishResultSchema.parse({
        publishedItemIds: [ITEM_A],
      }),
    ).toEqual({ publishedItemIds: [ITEM_A] });
    expect(
      adminCurriculumBulkArchiveResultSchema.parse({
        archivedItemIds: [ITEM_A],
        alreadyArchivedItemIds: [ITEM_B],
      }),
    ).toEqual({ archivedItemIds: [ITEM_A], alreadyArchivedItemIds: [ITEM_B] });
    expect(
      adminCurriculumBulkMoveResultSchema.parse({
        movedItemIds: [ITEM_A],
        unchangedItemIds: [],
      }),
    ).toEqual({ movedItemIds: [ITEM_A], unchangedItemIds: [] });
  });

  it("are not accepted when a part is missing", () => {
    expect(adminCurriculumBulkPublishResultSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      adminCurriculumBulkArchiveResultSchema.safeParse({
        archivedItemIds: [ITEM_A],
      }).success,
    ).toBe(false);
    expect(
      adminCurriculumBulkMoveResultSchema.safeParse({
        movedItemIds: [ITEM_A],
      }).success,
    ).toBe(false);
  });
});

/**
 * Spec 26 Unit 8: the import history. A strict query (one language, which
 * history, a cursor and a size — nothing the endpoint would ignore), a row with
 * no storage location or uploader in it, and three commands whose bodies carry
 * no data but a typed confirmation.
 */
describe("adminImportListQuerySchema", () => {
  const base = { language: LANGUAGE };

  it("needs a language, and nothing else", () => {
    const parsed = adminImportListQuerySchema.parse(base);
    expect(parsed).toEqual({
      language: LANGUAGE,
      limit: IMPORT_LIST_PAGE_SIZE,
    });
    for (const language of [undefined, "", "es", "not-a-uuid"]) {
      expect(adminImportListQuerySchema.safeParse({ language }).success).toBe(
        false,
      );
    }
  });

  it("asks for the normal history unless it says `archived=true` — and says only true or false", () => {
    expect(
      adminImportListQuerySchema.parse({ ...base, archived: "true" }).archived,
    ).toBe("true");
    expect(
      adminImportListQuerySchema.parse({ ...base, archived: "false" }).archived,
    ).toBe("false");
    for (const archived of ["1", "yes", "TRUE", "", true, false]) {
      expect(
        adminImportListQuerySchema.safeParse({ ...base, archived }).success,
        String(archived),
      ).toBe(false);
    }
  });

  it("takes the query string's numbers as text, within the bounds", () => {
    expect(
      adminImportListQuerySchema.parse({ ...base, limit: "50" }).limit,
    ).toBe(50);
    expect(
      adminImportListQuerySchema.safeParse({
        ...base,
        limit: String(IMPORT_LIST_MAX_PAGE_SIZE + 1),
      }).success,
    ).toBe(false);
    for (const limit of ["0", "-1", "1.5", "many"]) {
      expect(
        adminImportListQuerySchema.safeParse({ ...base, limit }).success,
        limit,
      ).toBe(false);
    }
  });

  it("refuses a filter, a sort or a page that nothing here would honour", () => {
    for (const extra of [
      { status: "failed" },
      { search: "level" },
      { sort: "status" },
      { page: "2" },
      { order: "ASC" },
      { uploadedBy: "someone" },
    ]) {
      expect(
        adminImportListQuerySchema.safeParse({ ...base, ...extra }).success,
      ).toBe(false);
    }
  });

  it("bounds the cursor", () => {
    expect(
      adminImportListQuerySchema.safeParse({ ...base, cursor: "abc" }).success,
    ).toBe(true);
    for (const cursor of ["", "   ", "x".repeat(513)]) {
      expect(
        adminImportListQuerySchema.safeParse({ ...base, cursor }).success,
      ).toBe(false);
    }
  });
});

describe("adminImportRowSchema and adminImportPageSchema", () => {
  const row = {
    id: "60000000-0000-4000-8000-000000000001",
    originalFilename: "spanish-level-2.csv",
    status: "completed" as const,
    totalRows: 61,
    createCount: 43,
    updateCount: 8,
    moveCount: 2,
    unchangedCount: 6,
    reviewCount: 0,
    skippedCount: 2,
    attemptCount: 1,
    createdAt: "2026-09-10T11:59:00.123Z",
    archivedAt: null,
  };

  it("describes an import by what it found and when", () => {
    expect(adminImportRowSchema.parse(row)).toEqual(row);
    expect(
      adminImportRowSchema.parse({
        ...row,
        archivedAt: "2026-10-01T08:30:00.000Z",
      }).archivedAt,
    ).toBe("2026-10-01T08:30:00.000Z");
  });

  it("knows every status the pipeline has, and no other", () => {
    for (const status of IMPORT_STATUSES) {
      expect(adminImportRowSchema.safeParse({ ...row, status }).success).toBe(
        true,
      );
    }
    for (const status of ["pending", "COMPLETED", "done", "", null]) {
      expect(adminImportRowSchema.safeParse({ ...row, status }).success).toBe(
        false,
      );
    }
  });

  it("refuses a count that is negative, fractional or missing", () => {
    for (const field of [
      "totalRows",
      "createCount",
      "updateCount",
      "moveCount",
      "unchangedCount",
      "reviewCount",
      "skippedCount",
      "attemptCount",
    ] as const) {
      for (const value of [-1, 1.5, "3", undefined]) {
        expect(
          adminImportRowSchema.safeParse({ ...row, [field]: value }).success,
          `${field} ${String(value)}`,
        ).toBe(false);
      }
    }
  });

  it("strips what an import record holds but a row must never carry", () => {
    const parsed = adminImportRowSchema.parse({
      ...row,
      s3Bucket: "bucket",
      s3Key: "imports/key",
      sourceSha256: "abc",
      uploadedByUserId: "someone",
      lastErrorSummary: "private detail",
    });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(row).sort());
  });

  it("is a cursor page like the others, with no total", () => {
    const page = {
      items: [row],
      nextCursor: "next",
      hasPreviousPage: true,
      previousCursor: null,
    };
    expect(adminImportPageSchema.parse(page)).toEqual(page);
    expect(adminImportPageSchema.safeParse({ items: [row] }).success).toBe(
      false,
    );
  });
});

describe("the import history commands", () => {
  const IMPORT = "60000000-0000-4000-8000-000000000001";

  it("take an import by its path, which must be an id", () => {
    expect(adminImportPathSchema.safeParse({ importId: IMPORT }).success).toBe(
      true,
    );
    for (const importId of ["", "not-an-id", "../1", IMPORT + "x", undefined]) {
      expect(adminImportPathSchema.safeParse({ importId }).success).toBe(false);
    }
  });

  it.each([
    ["archive", adminImportArchiveRequestSchema],
    ["restore", adminImportRestoreRequestSchema],
  ])(
    "%s carries no data at all — the body is {} and nothing else",
    (_name, schema) => {
      expect(schema.safeParse({}).success).toBe(true);
      for (const body of [
        { importId: IMPORT },
        { actorUserId: "someone" },
        { archived: true },
        { confirmation: IMPORT_DELETE_CONFIRMATION },
        { idempotencyKey: "0881836c-de9a-4dc5-84f7-1dd28b8fa439" },
      ]) {
        expect(schema.safeParse(body).success, JSON.stringify(body)).toBe(
          false,
        );
      }
    },
  );

  it("delete needs the exact word the person types, and nothing else", () => {
    expect(IMPORT_DELETE_CONFIRMATION).toBe("DELETE");
    expect(
      adminImportDeleteRequestSchema.safeParse({ confirmation: "DELETE" })
        .success,
    ).toBe(true);
    for (const confirmation of [
      "delete",
      "Delete",
      " DELETE",
      "DELETE ",
      "DELETED",
      "",
      true,
      undefined,
    ]) {
      expect(
        adminImportDeleteRequestSchema.safeParse({ confirmation }).success,
        String(confirmation),
      ).toBe(false);
    }
    expect(
      adminImportDeleteRequestSchema.safeParse({
        confirmation: "DELETE",
        importId: IMPORT,
      }).success,
    ).toBe(false);
    expect(adminImportDeleteRequestSchema.safeParse({}).success).toBe(false);
  });

  it("answer with the import they acted on", () => {
    expect(adminImportCommandResultSchema.parse({ importId: IMPORT })).toEqual({
      importId: IMPORT,
    });
    expect(adminImportCommandResultSchema.safeParse({}).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Dictionary mapping queue (spec 26 Unit 9)                                  */
/* -------------------------------------------------------------------------- */

describe("the dictionary contract mirrors the lexicon it describes", () => {
  // The contract is value-imported by the browser and cannot import the
  // lexicon's server graph, so these lists are copies. A copy that drifts would
  // make the queue refuse (or silently drop) a state the lexicon really has.
  it("names exactly the match states the lexicon labels", () => {
    expect([...MAPPING_MATCH_STATUSES].sort()).toEqual(
      Object.keys(MATCH_STATUS_LABELS).sort(),
    );
  });

  it("names exactly the regional statuses, confidences and review reasons the lexicon labels", () => {
    expect([...MAPPING_REGIONAL_STATUSES].sort()).toEqual(
      Object.keys(REGIONAL_STATUS_LABELS).sort(),
    );
    expect([...MAPPING_CONFIDENCES].sort()).toEqual(
      Object.keys(MATCH_CONFIDENCE_LABELS).sort(),
    );
    expect([...MAPPING_REVIEW_REASON_CODES]).toEqual([
      ...MAPPING_REVIEW_REASONS,
    ]);
    expect(Object.keys(REVIEW_REASON_LABELS).sort()).toEqual(
      [...MAPPING_REVIEW_REASON_CODES].sort(),
    );
  });
});

describe("adminDictionaryListQuerySchema", () => {
  it("takes a language and defaults the page: the first, at the default size", () => {
    expect(
      adminDictionaryListQuerySchema.parse({ language: LANGUAGE }),
    ).toEqual({
      language: LANGUAGE,
      offset: 0,
      limit: DICTIONARY_LIST_PAGE_SIZE,
    });
  });

  it("takes every filter the page always had, and the numbers as text", () => {
    expect(
      adminDictionaryListQuerySchema.parse({
        language: LANGUAGE,
        level: LEVEL,
        group: KEY,
        status: "review_required",
        pos: "verb",
        region: " es-MX ",
        regional: "not_listed",
        offset: "50",
        limit: "10",
      }),
    ).toEqual({
      language: LANGUAGE,
      level: LEVEL,
      group: KEY,
      status: "review_required",
      pos: "verb",
      region: "es-MX",
      regional: "not_listed",
      offset: 50,
      limit: 10,
    });
  });

  it.each([
    ["no language", {}],
    ["a level that is not an id", { language: LANGUAGE, level: "1" }],
    ["a group that is not an id", { language: LANGUAGE, group: "animals" }],
    [
      "a match state that does not exist",
      { language: LANGUAGE, status: "done" },
    ],
    [
      "a part of speech outside the offered set",
      { language: LANGUAGE, pos: "noun phrase" },
    ],
    [
      "a regional status that does not exist",
      { language: LANGUAGE, regional: "yes" },
    ],
    ["a region of one letter", { language: LANGUAGE, region: "e" }],
    [
      "a region of seventeen characters",
      { language: LANGUAGE, region: "x".repeat(17) },
    ],
    ["a negative offset", { language: LANGUAGE, offset: "-1" }],
    ["a fractional offset", { language: LANGUAGE, offset: "2.5" }],
    ["a size of zero", { language: LANGUAGE, limit: "0" }],
    [
      "a size over the cap",
      { language: LANGUAGE, limit: String(DICTIONARY_LIST_MAX_PAGE_SIZE + 1) },
    ],
    ["a sort", { language: LANGUAGE, sort: "word" }],
    ["a search", { language: LANGUAGE, search: "gato" }],
    ["a cursor", { language: LANGUAGE, cursor: "x" }],
  ])("refuses %s", (_name, query) => {
    expect(adminDictionaryListQuerySchema.safeParse(query).success).toBe(false);
  });

  it("offers every part of speech the curriculum editors offer", () => {
    expect([...MAPPING_PARTS_OF_SPEECH]).toEqual([
      "noun",
      "verb",
      "adjective",
      "adverb",
      "pronoun",
      "preposition",
      "conjunction",
      "phrase",
    ]);
  });
});

describe("adminDictionaryRowSchema and adminDictionaryPageSchema", () => {
  const row = {
    id: KEY,
    displayWord: "el gato",
    translation: "cat",
    levelNumber: 1,
    groupName: "Animals",
    lookupForm: "gato",
    matchStatus: "auto_matched",
    confidence: "high",
    reviewReason: null,
    manualLock: false,
    entryLemma: "gato",
    entryPartOfSpeech: "noun",
    confirmable: true,
    regionalStatus: "recognized",
  };
  const counts = {
    unmatched: 0,
    source_data_not_imported: 0,
    auto_matched: 1,
    review_required: 0,
    manual: 0,
    no_mapping: 0,
  };

  it("describes a word that has been matched, and one nothing has looked at", () => {
    expect(adminDictionaryRowSchema.parse(row)).toEqual(row);
    expect(
      adminDictionaryRowSchema.safeParse({
        ...row,
        matchStatus: null,
        confidence: null,
        lookupForm: null,
        entryLemma: null,
        entryPartOfSpeech: null,
        regionalStatus: null,
        confirmable: false,
      }).success,
    ).toBe(true);
  });

  it("strips what the queue was never meant to carry — a dictionary entry's id, source text", () => {
    const parsed = adminDictionaryRowSchema.parse({
      ...row,
      entryId: "a0000000-0000-4000-8000-000000000001",
      rawSource: "<entry/>",
    });
    expect(parsed).not.toHaveProperty("entryId");
    expect(parsed).not.toHaveProperty("rawSource");
  });

  it.each([
    ["a match state that does not exist", { matchStatus: "done" }],
    ["a confidence that does not exist", { confidence: "certain" }],
    ["a review reason that does not exist", { reviewReason: "bored" }],
    ["a regional status that does not exist", { regionalStatus: "yes" }],
    ["no `confirmable`", { confirmable: undefined }],
  ])("refuses %s", (_name, override) => {
    expect(
      adminDictionaryRowSchema.safeParse({ ...row, ...override }).success,
    ).toBe(false);
  });

  it("is a page with a real total, the language's counts, and the region it speaks about", () => {
    const page = {
      items: [row],
      total: 130,
      counts,
      regionCode: "es-MX",
      regionCodes: ["es-MX", "es"],
    };
    expect(adminDictionaryPageSchema.parse(page)).toEqual(page);
    expect(
      adminDictionaryPageSchema.safeParse({ ...page, total: -1 }).success,
    ).toBe(false);
    expect(
      adminDictionaryPageSchema.safeParse({ ...page, regionCode: undefined })
        .success,
    ).toBe(false);
    expect(
      adminDictionaryCountsSchema.safeParse({ ...counts, no_mapping: -1 })
        .success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Official decks (spec 26 Unit 10)                                           */
/* -------------------------------------------------------------------------- */

describe("adminDeckListQuerySchema", () => {
  it("takes a language and nothing else", () => {
    expect(adminDeckListQuerySchema.parse({ language: LANGUAGE })).toEqual({
      language: LANGUAGE,
    });
  });

  it.each([
    ["no language", {}],
    ["a language that is not an id", { language: "es" }],
    // Only official decks exist here: there is no way to ask for another kind.
    ["a kind of deck", { language: LANGUAGE, kind: "personal" }],
    ["an owner", { language: LANGUAGE, owner: KEY }],
    ["a sort", { language: LANGUAGE, sort: "name" }],
    ["a size", { language: LANGUAGE, limit: "5" }],
    ["a cursor", { language: LANGUAGE, cursor: "x" }],
  ])("refuses %s", (_name, query) => {
    expect(adminDeckListQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe("adminDeckRowSchema and adminDeckListSchema", () => {
  const deck = {
    id: KEY,
    name: "Colors",
    description: "Colors and shapes",
    itemCount: 8,
    availability: "theme",
    gateLevelNumber: null,
  };

  it("describes a deck that reveals as items are learned, and one gated by a level", () => {
    expect(adminDeckRowSchema.parse(deck)).toEqual(deck);
    expect(
      adminDeckRowSchema.parse({
        ...deck,
        description: null,
        availability: "level",
        gateLevelNumber: 3,
      }),
    ).toMatchObject({ availability: "level", gateLevelNumber: 3 });
  });

  it("names exactly the availabilities decks have", () => {
    expect([...DECK_AVAILABILITIES].sort()).toEqual(["level", "theme"]);
  });

  it("strips an owner, a gate level's id and a kind — a list of official decks has no use for them", () => {
    const parsed = adminDeckRowSchema.parse({
      ...deck,
      ownerUserId: "someone",
      gateLevelId: "level",
      kind: "polyglot",
    });
    for (const field of ["ownerUserId", "gateLevelId", "kind"]) {
      expect(parsed).not.toHaveProperty(field);
    }
  });

  it.each([
    ["an availability that does not exist", { availability: "sometimes" }],
    ["a negative item count", { itemCount: -1 }],
    ["a fractional item count", { itemCount: 1.5 }],
  ])("refuses %s", (_name, override) => {
    expect(adminDeckRowSchema.safeParse({ ...deck, ...override }).success).toBe(
      false,
    );
  });

  it("is a bounded list that says whether it was cut", () => {
    expect(DECK_LIST_MAX).toBe(100);
    expect(
      adminDeckListSchema.parse({ items: [deck], truncated: false }),
    ).toEqual({ items: [deck], truncated: false });
    expect(adminDeckListSchema.safeParse({ items: [deck] }).success).toBe(
      false,
    );
  });
});

describe("adminLogListQuerySchema (the audit log)", () => {
  const ACTOR = "a0000000-0000-4000-8000-000000000001";

  it("needs nothing: no filter at all is the first page of the whole log", () => {
    expect(adminLogListQuerySchema.parse({})).toEqual({
      limit: LOG_LIST_PAGE_SIZE,
    });
  });

  it("takes each of the page's filters, as the Logs page always spelled them", () => {
    expect(
      adminLogListQuerySchema.parse({
        actor: ACTOR,
        action: "USER_ROLE_CHANGED",
        resourceType: "user",
        resourceId: "any-id",
        from: "2026-10-01",
        to: "2026-10-14",
        cursor: "opaque",
        limit: "10",
      }),
    ).toEqual({
      actor: ACTOR,
      action: "USER_ROLE_CHANGED",
      resourceType: "user",
      resourceId: "any-id",
      from: "2026-10-01",
      to: "2026-10-14",
      cursor: "opaque",
      limit: 10,
    });
  });

  it("knows every action the audit trail can record — and no other", () => {
    for (const action of ADMIN_AUDIT_ACTIONS) {
      expect(adminLogListQuerySchema.safeParse({ action }).success).toBe(true);
    }
    for (const action of ["", "user_role_changed", "SOMETHING_ELSE"]) {
      expect(
        adminLogListQuerySchema.safeParse({ action }).success,
        action,
      ).toBe(false);
    }
  });

  it("wants an actor to be an id", () => {
    for (const actor of ["", "ada", "not-a-uuid", `${ACTOR}0`]) {
      expect(adminLogListQuerySchema.safeParse({ actor }).success, actor).toBe(
        false,
      );
    }
  });

  it("wants a date to be a day that exists", () => {
    for (const day of ["2026-10-14", "2024-02-29", "2026-12-31"]) {
      expect(
        adminLogListQuerySchema.safeParse({ from: day, to: day }).success,
        day,
      ).toBe(true);
    }
    for (const day of [
      "",
      "yesterday",
      "2026-10-14T00:00:00Z",
      "10/14/2026",
      "2026-1-4",
      // Not days at all, though each *looks* like one.
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "2023-02-29",
    ]) {
      expect(
        adminLogListQuerySchema.safeParse({ from: day }).success,
        day,
      ).toBe(false);
      expect(adminLogListQuerySchema.safeParse({ to: day }).success, day).toBe(
        false,
      );
    }
  });

  it("bounds the free-text filters and the cursor", () => {
    expect(
      adminLogListQuerySchema.safeParse({ resourceType: "x".repeat(100) })
        .success,
    ).toBe(true);
    expect(
      adminLogListQuerySchema.safeParse({ resourceType: "x".repeat(101) })
        .success,
    ).toBe(false);
    expect(
      adminLogListQuerySchema.safeParse({ resourceId: "x".repeat(200) })
        .success,
    ).toBe(true);
    expect(
      adminLogListQuerySchema.safeParse({ resourceId: "x".repeat(201) })
        .success,
    ).toBe(false);
    for (const field of ["resourceType", "resourceId", "cursor"]) {
      for (const value of ["", "   "]) {
        expect(
          adminLogListQuerySchema.safeParse({ [field]: value }).success,
          `${field}=${JSON.stringify(value)}`,
        ).toBe(false);
      }
    }
    expect(
      adminLogListQuerySchema.safeParse({ cursor: "x".repeat(513) }).success,
    ).toBe(false);
  });

  it("takes the query string's numbers as text, within the bounds", () => {
    expect(adminLogListQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(
      adminLogListQuerySchema.safeParse({
        limit: String(LOG_LIST_MAX_PAGE_SIZE + 1),
      }).success,
    ).toBe(false);
    for (const limit of ["0", "-1", "1.5", "many"]) {
      expect(adminLogListQuerySchema.safeParse({ limit }).success, limit).toBe(
        false,
      );
    }
  });

  it("refuses a sort, a language or a search — nothing here would honour them", () => {
    for (const extra of [
      { sort: "action" },
      { order: "ASC" },
      { language: "5b2eb57d-acb8-4964-8af4-49a417cf227a" },
      { search: "role" },
      { tab: "audit" },
      { page: "2" },
    ]) {
      expect(adminLogListQuerySchema.safeParse(extra).success).toBe(false);
    }
  });
});

describe("adminLogRowSchema and adminLogPageSchema", () => {
  const row = {
    id: "e0000000-0000-4000-8000-000000000001",
    createdAt: "2026-10-14T22:46:21.710Z",
    actorId: "a0000000-0000-4000-8000-000000000001",
    actorName: "Ada Admin",
    action: "USER_ROLE_CHANGED",
    resourceType: "user",
    resourceId: "b0000000-0000-4000-8000-000000000002",
    reason: "Reviews lessons",
    correlationId: "correlation-1",
    beforeData: { role: "user" },
    afterData: { role: "writer" },
  };

  it("accepts a row, and a page of them, with the cursors alongside", () => {
    expect(adminLogRowSchema.parse(row)).toEqual(row);
    expect(
      adminLogPageSchema.parse({
        items: [row],
        nextCursor: "next",
        hasPreviousPage: true,
        previousCursor: null,
      }).items,
    ).toHaveLength(1);
  });

  it("lets what was recorded be any JSON, or nothing", () => {
    for (const data of [
      null,
      "text",
      3,
      [1, 2],
      { nested: { deep: [true] } },
    ]) {
      expect(
        adminLogRowSchema.safeParse({
          ...row,
          beforeData: data,
          afterData: data,
        }).success,
        JSON.stringify(data),
      ).toBe(true);
    }
  });

  it("strips anything it does not list — a sign-in id or an email cannot ride along", () => {
    const parsed = adminLogRowSchema.parse({
      ...row,
      clerkUserId: "user_2abc",
      email: "someone@example.com",
    });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(row).sort());
  });

  it("refuses an action that is not one the trail records, and an instant that is not one", () => {
    expect(
      adminLogRowSchema.safeParse({ ...row, action: "SOMETHING_ELSE" }).success,
    ).toBe(false);
    for (const createdAt of ["", "yesterday", "2026-10-14", 12]) {
      expect(
        adminLogRowSchema.safeParse({ ...row, createdAt }).success,
        String(createdAt),
      ).toBe(false);
    }
  });

  it("allows only the cursors it names", () => {
    expect(
      adminLogPageSchema.safeParse({
        items: [],
        nextCursor: null,
        hasPreviousPage: false,
        previousCursor: null,
      }).success,
    ).toBe(true);
    expect(
      adminLogPageSchema.safeParse({ items: [], nextCursor: null }).success,
    ).toBe(false);
  });
});
