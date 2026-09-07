import { describe, expect, it } from "vitest";

import { evaluateLevelValidation } from "./curriculum-validation-config";

describe("evaluateLevelValidation", () => {
  it("matches spec 11 rewrite's exact example (47/48 vocab, 12/12 grammar, 4/4 groups)", () => {
    const result = evaluateLevelValidation({ vocabularyItems: 47, vocabularyGroups: 4, grammarItems: 12 });
    expect(result.vocabularyItems).toEqual({ actual: 47, expected: 48, satisfied: false });
    expect(result.grammarItems).toEqual({ actual: 12, expected: 12, satisfied: true });
    expect(result.vocabularyGroups).toEqual({ actual: 4, expected: 4, satisfied: true });
    expect(result.allSatisfied).toBe(false);
  });

  it("is satisfied only when every count meets its configured target", () => {
    const result = evaluateLevelValidation({ vocabularyItems: 48, vocabularyGroups: 4, grammarItems: 12 });
    expect(result.allSatisfied).toBe(true);
  });

  it("does not penalize exceeding a target", () => {
    const result = evaluateLevelValidation({ vocabularyItems: 50, vocabularyGroups: 4, grammarItems: 12 });
    expect(result.vocabularyItems.satisfied).toBe(true);
    expect(result.allSatisfied).toBe(true);
  });
});
