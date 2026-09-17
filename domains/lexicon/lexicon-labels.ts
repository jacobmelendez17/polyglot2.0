import type {
  DictionaryMatchConfidence,
  DictionaryMatchStatus,
  MappingReviewReason,
  RegionalEvidenceStatus,
} from "./lexicon-types";

/**
 * Human labels for the Lexicon domain's state values. Pure and
 * database-free, so both server components and client components can import
 * them, and so the wording lives in one place rather than being retyped in
 * each table cell and detail panel.
 *
 * The stored values are lowercase `snake_case` (matching every Postgres enum
 * in this schema); spec 12 writes them in uppercase prose. Neither spelling
 * is what an admin should read, hence these.
 */

export const MATCH_STATUS_LABELS: Record<DictionaryMatchStatus, string> = {
  unmatched: "No match",
  source_data_not_imported: "Not imported",
  auto_matched: "Auto-matched",
  review_required: "Needs review",
  manual: "Manual",
};

export const MATCH_CONFIDENCE_LABELS: Record<
  DictionaryMatchConfidence,
  string
> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const REVIEW_REASON_LABELS: Record<MappingReviewReason, string> = {
  multiple_candidates: "Several matching entries",
  part_of_speech_conflict: "Part of speech doesn't match",
  phrase_ambiguity: "Ambiguous phrase",
  selected_sense_missing: "A selected definition disappeared upstream",
  entry_missing_from_source: "Entry disappeared upstream",
  regional_mismatch: "Labelled for a different region",
};

export const REGIONAL_STATUS_LABELS: Record<RegionalEvidenceStatus, string> = {
  recognized: "Recognized",
  not_listed: "Not listed",
  unknown: "No data",
};

/**
 * Explains what `not_listed` does and does not mean, wherever it is shown.
 * Spec 12 is explicit that absence from a regional word list is not proof a
 * form is invalid in that region, and an admin reading a bare "Not listed"
 * badge would reasonably assume the opposite.
 */
export const NOT_LISTED_CAVEAT =
  "Absent from this region's word list. Absence is weak evidence, not proof the form is wrong.";
