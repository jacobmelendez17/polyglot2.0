/**
 * Shared deterministic normalization for comparing learner-entered text
 * against curriculum/synonym data — case and whitespace only, never
 * diacritics/accents, per architecture.md's duplicate-normalization rule
 * ("si" and "sí" must remain distinct terms). No fuzzy matching or tolerance
 * here; that's `check-answer.ts`'s concern, layered on top of this.
 *
 * Extracted as its own module per spec 08 §72: this is the "shared module"
 * both `checkAnswer` (spec 07 §24, the review session's future consumer
 * too) and learner-owned synonym storage (`user_synonyms.normalized_value`)
 * are required to consume, so the two can never quietly drift apart.
 */
export function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
