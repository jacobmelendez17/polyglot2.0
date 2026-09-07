/**
 * Spec 08's "Universal Curriculum Validation" / spec 11 rewrite's "Levels
 * Management" configured expectations — validation/configuration rules,
 * never a rigid schema limit (architecture.md's explicit instruction: "must
 * not be hardcoded informally"). Centralized here so a future config change
 * (e.g. a language with a different curriculum shape) touches one file.
 */
export const CURRICULUM_VALIDATION_CONFIG = {
  vocabularyItemsPerLevel: 48,
  vocabularyGroupsPerLevel: 4,
  vocabularyItemsPerGroup: 12,
  grammarItemsPerLevel: 12,
} as const;

export type LevelValidationCounts = {
  vocabularyItems: number;
  vocabularyGroups: number;
  grammarItems: number;
};

export type LevelValidationResult = {
  vocabularyItems: { actual: number; expected: number; satisfied: boolean };
  vocabularyGroups: { actual: number; expected: number; satisfied: boolean };
  grammarItems: { actual: number; expected: number; satisfied: boolean };
  allSatisfied: boolean;
};

/** Pure comparison against the configured targets — spec 11 rewrite's "Level 8: Vocabulary 47/48 ⚠, Grammar 12/12 ✓, Groups 4/4 ✓" example. */
export function evaluateLevelValidation(counts: LevelValidationCounts): LevelValidationResult {
  const vocabularyItems = {
    actual: counts.vocabularyItems,
    expected: CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel,
    satisfied: counts.vocabularyItems >= CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel,
  };
  const vocabularyGroups = {
    actual: counts.vocabularyGroups,
    expected: CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel,
    satisfied: counts.vocabularyGroups >= CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel,
  };
  const grammarItems = {
    actual: counts.grammarItems,
    expected: CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel,
    satisfied: counts.grammarItems >= CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel,
  };

  return {
    vocabularyItems,
    vocabularyGroups,
    grammarItems,
    allSatisfied: vocabularyItems.satisfied && vocabularyGroups.satisfied && grammarItems.satisfied,
  };
}
