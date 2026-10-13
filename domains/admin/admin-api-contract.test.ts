import { describe, expect, it } from "vitest";

import {
  ADMIN_CEFR_LEVELS,
  CURRICULUM_STATUSES,
  adminLevelCreateRequestSchema,
  adminLevelListQuerySchema,
  adminLevelPathSchema,
  adminLevelRowSchema,
  adminLevelUpdateRequestSchema,
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
