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

/**
 * Per-level overrides of the configured defaults (2026-09-07).
 *
 * Spec 11 calls the 48/4/12 figures "validation rules, not hardcoded schema
 * assumptions", and architecture.md requires the model support a different
 * curriculum shape without a redesign — but until now a single global
 * constant meant every level had to be the same size, so a deliberately
 * smaller one could never be published.
 *
 * Each field is independently overridable:
 *
 * - `null`/absent — use the configured default for that dimension.
 * - a number — this level's own target.
 * - `0` — no requirement at all, for a level that genuinely has none of
 *   that kind of content.
 *
 * Publishing still fails when a target is unmet (spec 11's "Publishing
 * should fail if mandatory Level validation is not satisfied"). What changed
 * is that the target is now a curriculum decision per level, not a constant.
 */
export type LevelValidationTargets = {
  vocabularyItems?: number | null;
  vocabularyGroups?: number | null;
  grammarItems?: number | null;
};

/** The targets actually applied to a level: its own overrides, falling back to the configured defaults. */
export function resolveLevelValidationTargets(targets: LevelValidationTargets = {}): Required<{
  [K in keyof LevelValidationTargets]: number;
}> {
  return {
    vocabularyItems: targets.vocabularyItems ?? CURRICULUM_VALIDATION_CONFIG.vocabularyItemsPerLevel,
    vocabularyGroups: targets.vocabularyGroups ?? CURRICULUM_VALIDATION_CONFIG.vocabularyGroupsPerLevel,
    grammarItems: targets.grammarItems ?? CURRICULUM_VALIDATION_CONFIG.grammarItemsPerLevel,
  };
}

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

/**
 * Pure comparison against the level's effective targets — spec 11 rewrite's
 * "Level 8: Vocabulary 47/48 ⚠, Grammar 12/12 ✓, Groups 4/4 ✓" example, now
 * with the denominators resolved per level rather than fixed globally.
 *
 * `targets` is optional so every existing caller keeps the configured
 * defaults without change.
 */
export function evaluateLevelValidation(
  counts: LevelValidationCounts,
  targets: LevelValidationTargets = {},
): LevelValidationResult {
  const resolved = resolveLevelValidationTargets(targets);
  const vocabularyItems = {
    actual: counts.vocabularyItems,
    expected: resolved.vocabularyItems,
    satisfied: counts.vocabularyItems >= resolved.vocabularyItems,
  };
  const vocabularyGroups = {
    actual: counts.vocabularyGroups,
    expected: resolved.vocabularyGroups,
    satisfied: counts.vocabularyGroups >= resolved.vocabularyGroups,
  };
  const grammarItems = {
    actual: counts.grammarItems,
    expected: resolved.grammarItems,
    satisfied: counts.grammarItems >= resolved.grammarItems,
  };

  return {
    vocabularyItems,
    vocabularyGroups,
    grammarItems,
    allSatisfied: vocabularyItems.satisfied && vocabularyGroups.satisfied && grammarItems.satisfied,
  };
}
