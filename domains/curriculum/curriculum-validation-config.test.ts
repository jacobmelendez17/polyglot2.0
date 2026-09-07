import { describe, expect, it } from "vitest";

import {
  CURRICULUM_VALIDATION_CONFIG,
  evaluateLevelValidation,
  resolveLevelValidationTargets,
} from "./curriculum-validation-config";

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

describe("per-level validation targets", () => {
  const counts = { vocabularyItems: 4, vocabularyGroups: 1, grammarItems: 0 };

  it("falls back to the configured defaults when a level sets no targets of its own", () => {
    const result = evaluateLevelValidation(counts);
    expect(result.vocabularyItems.expected).toBe(CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel);
    expect(result.grammarItems.expected).toBe(CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel);
    expect(result.allSatisfied).toBe(false);
  });

  it("uses a level's own targets, letting a deliberately small level satisfy validation", () => {
    const result = evaluateLevelValidation(counts, { vocabularyItems: 4, vocabularyGroups: 1, grammarItems: 0 });
    expect(result.vocabularyItems).toEqual({ actual: 4, expected: 4, satisfied: true });
    expect(result.vocabularyGroups).toEqual({ actual: 1, expected: 1, satisfied: true });
    // A target of 0 means "no requirement", not "must have none".
    expect(result.grammarItems).toEqual({ actual: 0, expected: 0, satisfied: true });
    expect(result.allSatisfied).toBe(true);
  });

  it("treats a zero target as satisfied even when content exists", () => {
    const result = evaluateLevelValidation({ ...counts, grammarItems: 3 }, { grammarItems: 0 });
    expect(result.grammarItems.satisfied).toBe(true);
  });

  it("overrides each dimension independently", () => {
    const result = evaluateLevelValidation(counts, { vocabularyItems: 4 });
    expect(result.vocabularyItems.satisfied).toBe(true);
    // Untouched dimensions keep the configured default and stay unsatisfied.
    expect(result.grammarItems.expected).toBe(CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel);
    expect(result.allSatisfied).toBe(false);
  });

  it("treats an explicit null as 'use the default', not as zero", () => {
    const result = evaluateLevelValidation(counts, { grammarItems: null });
    expect(result.grammarItems.expected).toBe(CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel);
    expect(result.grammarItems.satisfied).toBe(false);
  });

  it("still raises the bar when a level sets a larger target than the default", () => {
    const result = evaluateLevelValidation({ ...counts, vocabularyItems: 60 }, { vocabularyItems: 100 });
    expect(result.vocabularyItems).toEqual({ actual: 60, expected: 100, satisfied: false });
  });
});

describe("resolveLevelValidationTargets", () => {
  it("resolves every dimension, defaulting each independently", () => {
    expect(resolveLevelValidationTargets({ grammarItems: 0 })).toEqual({
      vocabularyItems: CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel,
      vocabularyGroups: CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel,
      grammarItems: 0,
    });
  });

  it("resolves to the configured defaults when given nothing", () => {
    expect(resolveLevelValidationTargets()).toEqual({
      vocabularyItems: CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel,
      vocabularyGroups: CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel,
      grammarItems: CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel,
    });
  });
});
