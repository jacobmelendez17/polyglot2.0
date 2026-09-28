import { describe, expect, it } from "vitest";

import {
  getAdjacentAdminCurriculumItemInputSchema,
  getAdminCurriculumItemsInputSchema,
  getLevelContentSummaryInputSchema,
} from "./curriculum-admin-schemas";

const VALID_UUID = "40000000-0000-0000-0000-000000000001";

describe("getAdminCurriculumItemsInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const result = getAdminCurriculumItemsInputSchema.parse({
      languageId: VALID_UUID,
      limit: 20,
    });
    expect(result.languageId).toBe(VALID_UUID);
  });

  it("accepts every filter combined", () => {
    const result = getAdminCurriculumItemsInputSchema.parse({
      languageId: VALID_UUID,
      levelId: VALID_UUID,
      type: "grammar",
      status: "pending",
      groupId: VALID_UUID,
      search: "gato",
      limit: 20,
      cursor: "some-opaque-cursor",
    });
    expect(result.status).toBe("pending");
  });

  it("rejects a missing languageId", () => {
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({ limit: 20 }),
    ).toThrow();
  });

  it("rejects an unknown status", () => {
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({
        languageId: VALID_UUID,
        status: "live",
        limit: 20,
      }),
    ).toThrow();
  });

  it("rejects an unknown type", () => {
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({
        languageId: VALID_UUID,
        type: "kanji",
        limit: 20,
      }),
    ).toThrow();
  });

  it("rejects a limit above the configured maximum", () => {
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({
        languageId: VALID_UUID,
        limit: 500,
      }),
    ).toThrow();
  });

  it("spec 25 §15 — accepts every needs filter value, rejects an unknown one", () => {
    for (const needs of [
      "definition",
      "examples",
      "ipa",
      "pronunciation",
      "synonyms",
      "variations",
      "draft_changes",
      "ready_to_publish",
    ] as const) {
      expect(
        getAdminCurriculumItemsInputSchema.parse({
          languageId: VALID_UUID,
          needs,
          limit: 20,
        }).needs,
      ).toBe(needs);
    }
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({
        languageId: VALID_UUID,
        needs: "warnings",
        limit: 20,
      }),
    ).toThrow();
  });
});

describe("getAdjacentAdminCurriculumItemInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const result = getAdjacentAdminCurriculumItemInputSchema.parse({
      languageId: VALID_UUID,
      currentLevelNumber: 1,
      currentPosition: 3,
      currentId: VALID_UUID,
      direction: "next",
    });
    expect(result.direction).toBe("next");
  });

  it("rejects an unknown direction", () => {
    expect(() =>
      getAdjacentAdminCurriculumItemInputSchema.parse({
        languageId: VALID_UUID,
        currentLevelNumber: 1,
        currentPosition: 3,
        currentId: VALID_UUID,
        direction: "sideways",
      }),
    ).toThrow();
  });
});

describe("getLevelContentSummaryInputSchema", () => {
  it("requires both languageId and levelId", () => {
    expect(() =>
      getLevelContentSummaryInputSchema.parse({ languageId: VALID_UUID }),
    ).toThrow();
    expect(
      getLevelContentSummaryInputSchema.parse({
        languageId: VALID_UUID,
        levelId: VALID_UUID,
      }),
    ).toEqual({ languageId: VALID_UUID, levelId: VALID_UUID });
  });
});
