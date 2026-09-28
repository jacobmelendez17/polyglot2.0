import { describe, expect, it, vi } from "vitest";

import {
  CURRICULUM_KEY_SEGMENT_BY_ITEM_TYPE,
  generateCurriculumKey,
  withGeneratedCurriculumKey,
} from "./curriculum-key-service";

describe("generateCurriculumKey", () => {
  it("builds a key in {languageCode}:{segment}:{suffix} form", () => {
    const key = generateCurriculumKey("es-MX", "vocab");
    expect(key).toMatch(/^es-MX:vocab:[a-z0-9]{6}$/);
  });

  it("uses the exact segment strings the spec documents for each item type", () => {
    expect(CURRICULUM_KEY_SEGMENT_BY_ITEM_TYPE.vocabulary).toBe("vocab");
    expect(CURRICULUM_KEY_SEGMENT_BY_ITEM_TYPE.grammar).toBe("grammar");
  });

  it("produces a different suffix on every call", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => generateCurriculumKey("es-MX", "level")),
    );
    expect(keys.size).toBe(50);
  });

  it("never includes characters that would need CSV escaping", () => {
    const key = generateCurriculumKey("es-MX", "group");
    expect(key).not.toMatch(/[,"'\n\r|]/);
  });
});

describe("withGeneratedCurriculumKey", () => {
  it("returns the insert result on the first attempt when there is no conflict", async () => {
    const insertRow = vi.fn(async (curriculumKey: string) => ({
      curriculumKey,
    }));
    const result = await withGeneratedCurriculumKey(
      "es-MX",
      "vocab",
      "learning_items_curriculum_key_key",
      insertRow,
    );
    expect(insertRow).toHaveBeenCalledTimes(1);
    expect(result.curriculumKey).toMatch(/^es-MX:vocab:[a-z0-9]{6}$/);
  });

  it("retries with a freshly generated key when the curriculum_key constraint is violated", async () => {
    const seenKeys: string[] = [];
    const insertRow = vi.fn(async (curriculumKey: string) => {
      seenKeys.push(curriculumKey);
      if (seenKeys.length < 3) {
        const error: { code: string; constraint: string } = {
          code: "23505",
          constraint: "learning_items_curriculum_key_key",
        };
        throw error;
      }
      return curriculumKey;
    });

    const result = await withGeneratedCurriculumKey(
      "es-MX",
      "grammar",
      "learning_items_curriculum_key_key",
      insertRow,
    );

    expect(insertRow).toHaveBeenCalledTimes(3);
    expect(result).toBe(seenKeys[2]);
    expect(new Set(seenKeys).size).toBe(3);
  });

  it("does not retry, and rethrows immediately, on a conflict from an unrelated constraint", async () => {
    const positionConflict = {
      code: "23505",
      constraint: "learning_items_level_type_position_key",
    };
    const insertRow = vi.fn(async () => {
      throw positionConflict;
    });

    await expect(
      withGeneratedCurriculumKey(
        "es-MX",
        "vocab",
        "learning_items_curriculum_key_key",
        insertRow,
      ),
    ).rejects.toBe(positionConflict);
    expect(insertRow).toHaveBeenCalledTimes(1);
  });

  it("gives up after the maximum number of attempts and surfaces the last conflict as the cause", async () => {
    const conflict = {
      code: "23505",
      constraint: "levels_curriculum_key_key",
    };
    const insertRow = vi.fn(async () => {
      throw conflict;
    });

    await expect(
      withGeneratedCurriculumKey(
        "es-MX",
        "level",
        "levels_curriculum_key_key",
        insertRow,
      ),
    ).rejects.toThrow(/Could not generate a unique curriculum key/);
    expect(insertRow).toHaveBeenCalledTimes(5);
  });
});
