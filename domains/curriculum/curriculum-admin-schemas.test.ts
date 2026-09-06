import { describe, expect, it } from "vitest";

import { getAdminCurriculumItemsInputSchema } from "./curriculum-admin-schemas";

const VALID_UUID = "40000000-0000-0000-0000-000000000001";

describe("getAdminCurriculumItemsInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const result = getAdminCurriculumItemsInputSchema.parse({ languageId: VALID_UUID, limit: 20 });
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
    expect(() => getAdminCurriculumItemsInputSchema.parse({ limit: 20 })).toThrow();
  });

  it("rejects an unknown status", () => {
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({ languageId: VALID_UUID, status: "live", limit: 20 }),
    ).toThrow();
  });

  it("rejects an unknown type", () => {
    expect(() =>
      getAdminCurriculumItemsInputSchema.parse({ languageId: VALID_UUID, type: "kanji", limit: 20 }),
    ).toThrow();
  });

  it("rejects a limit above the configured maximum", () => {
    expect(() => getAdminCurriculumItemsInputSchema.parse({ languageId: VALID_UUID, limit: 500 })).toThrow();
  });
});
