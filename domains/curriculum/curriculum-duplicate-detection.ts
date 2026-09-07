import { normalizeForComparison } from "@/lib/answer-checking/normalize";

import type { DuplicateCandidate } from "./curriculum-mutation-types";

/**
 * Pure duplicate-candidate matcher (spec 11 rewrite's "Duplicate
 * Detection") — reuses the same normalization `domains/srs`'s answer
 * checking and `user_synonyms` storage already share (case, whitespace,
 * never diacritics: "Gato"/"gato"/" GATO " match, "si"/"sí" never do).
 * Database-free by design — the repository fetches same-language,
 * same-type candidates once, and this function does the comparison, so the
 * matching rule has exactly one implementation regardless of how large the
 * candidate set is.
 */
export function findDuplicateCandidates(
  newDisplayForm: string,
  candidates: { learningItemId: string; displayForm: string; displayLabel: string; status: DuplicateCandidate["status"] }[],
): DuplicateCandidate[] {
  const normalizedNew = normalizeForComparison(newDisplayForm);
  return candidates
    .filter((candidate) => normalizeForComparison(candidate.displayForm) === normalizedNew)
    .map((candidate) => ({
      learningItemId: candidate.learningItemId,
      displayLabel: candidate.displayLabel,
      status: candidate.status,
    }));
}
