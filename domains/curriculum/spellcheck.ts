/**
 * Spec 25 §12 — a deliberately narrow, database-free spelling heuristic for
 * bulk CSV import: not a linguistic spellchecker (no morphology, no
 * Hunspell-style affix rules — the project's own Hunspell adapter parses
 * *regional word-list source files*, not live spelling suggestions; see
 * `domains/lexicon/import/hunspell-adapter.ts`), just "is this term an exact
 * known word, and if not, is there a known word one or two edits away?"
 * against the language's own already-imported dictionary lemmas
 * (`domains/lexicon`'s `dictionary_entries`). Advisory only — nothing here
 * blocks an import or silently rewrites a row; `bulk-import-service.ts`
 * surfaces the result as `spellingWarning` for an admin to accept, ignore,
 * or edit manually (spec §12's "Accept suggestion / Keep original / Edit
 * manually").
 *
 * Accents are never folded into the comparison (`si` vs `sí` are both real,
 * distinct words `architecture.md`'s Homonyms section already protects
 * elsewhere) — a suggestion can still *cross* an accent boundary (typing
 * "si" when "sí" is the only known word near it is exactly the kind of typo
 * this exists to catch), but nothing here treats the two as equivalent.
 */

const MAX_SUGGESTION_DISTANCE_SHORT = 1; // terms of 4 normalized characters or fewer
const MAX_SUGGESTION_DISTANCE_LONG = 2;
const MIN_TERM_LENGTH_TO_CHECK = 3; // too short for a distance-based suggestion to mean anything

/** Standard iterative Levenshtein edit distance (insert/delete/substitute, unit cost). Pure, no dependency — small enough that pulling in a spellchecking library for it would be the kind of unjustified dependency `ai-workflow-rules.md` warns against. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          previousRow[j]! + 1, // deletion
          currentRow[j - 1]! + 1, // insertion
          previousRow[j - 1]! + cost, // substitution
        ),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[b.length]!;
}

/**
 * `normalizedTerm` and every entry in `knownNormalizedLemmas` must already be
 * normalized the same way (case/whitespace only, per
 * `normalizeForComparison` — never accent-folded) — this function does no
 * normalization of its own, and its return value is the matched *normalized*
 * lemma; the caller re-applies the real casing/spelling it wants to display.
 * Returns `null` when the term already matches a known lemma exactly, is too
 * short to check meaningfully, or no known lemma is close enough to suggest.
 */
export function suggestSpellingCorrection(
  normalizedTerm: string,
  knownNormalizedLemmas: readonly string[],
): string | null {
  if (normalizedTerm.length < MIN_TERM_LENGTH_TO_CHECK) return null;
  if (knownNormalizedLemmas.includes(normalizedTerm)) return null;

  const maxDistance =
    normalizedTerm.length <= 4
      ? MAX_SUGGESTION_DISTANCE_SHORT
      : MAX_SUGGESTION_DISTANCE_LONG;

  let best: { lemma: string; distance: number } | null = null;
  for (const lemma of knownNormalizedLemmas) {
    // Cheap pre-filter before the O(n*m) distance computation — an edit
    // distance can never be smaller than the length difference.
    if (Math.abs(lemma.length - normalizedTerm.length) > maxDistance) continue;
    const distance = levenshteinDistance(normalizedTerm, lemma);
    if (distance === 0 || distance > maxDistance) continue;
    if (!best || distance < best.distance) best = { lemma, distance };
  }

  return best?.lemma ?? null;
}
