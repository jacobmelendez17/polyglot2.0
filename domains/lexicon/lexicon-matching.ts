import { isMultiwordForm } from "./lexical-normalization";
import type {
  DictionaryMatchConfidence,
  DictionaryMatchStatus,
  DictionarySourceStatus,
  MappingReviewReason,
} from "./lexicon-types";

/**
 * Spec 12 "Matching Algorithm" — deterministic, pure, and fully testable.
 * There is no AI, no fuzzy scoring, and no fabricated percentage anywhere in
 * this file; confidence is categorical because a made-up number would imply
 * a precision the evidence doesn't support.
 *
 * The pipeline, in the spec's own order:
 *
 *   lookup forms → exact lemma candidates → form candidates
 *   → POS comparison → phrase/expression comparison → regional evidence
 *   → ambiguity check → match status
 *
 * Two rules are load-bearing and worth stating plainly:
 *
 * - **Auto-match only when exactly one clear entry survives.** Anything else
 *   is `review_required`. Guessing between homonyms is precisely the error
 *   this whole domain exists to avoid.
 * - **Never pick the sense.** Even a confident `auto_matched` entry leaves
 *   every one of its senses unselected; choosing which meaning Polyglot
 *   teaches is an explicit admin act (spec 12 "Senses").
 */

/** One dictionary entry that some lookup form actually reached, with the evidence that reached it. */
export interface DictionaryMatchCandidate {
  entryId: string;
  /** Polyglot's normalized POS for the entry (see `normalizePartOfSpeech`). */
  partOfSpeech: string | null;
  sourceStatus: DictionarySourceStatus;
  /** The lookup form that found this candidate — exactly as it appeared in `lookupForms`. */
  matchedLookupForm: string;
  /** `lemma` when the lookup form equalled the entry's own headword; `form` when it only matched an inflected/alternative form. */
  matchedVia: "lemma" | "form";
  /**
   * Regions this entry is explicitly restricted to by the source's own usage
   * labels. Empty for the overwhelming majority of entries. Never inferred
   * from a word's absence in a regional list — spec 12 is explicit that
   * absence is not proof.
   */
  restrictedRegionCodes?: string[];
  /** Regional evidence for the matcher's primary region, when it has been evaluated. */
  primaryRegionEvidence?: "recognized" | "not_listed" | "unknown";
}

export interface ResolveDictionaryMatchInput {
  /** Ordered lookup forms from the language provider, most specific first. */
  lookupForms: string[];
  candidates: DictionaryMatchCandidate[];
  /** Polyglot's normalized POS for the curriculum item, or `null` when the admin's value isn't recognizable. */
  curriculumPartOfSpeech: string | null;
  /**
   * Whether the relevant source data has actually been imported for this
   * language. `false` produces `source_data_not_imported`, which spec 12
   * requires be distinguishable from a genuine `unmatched`.
   */
  isSourceDataImported: boolean;
  /** The matcher's primary region, used only as a tie-breaker and a restriction check. */
  primaryRegionCode?: string | null;
}

export interface DictionaryMatchResolution {
  status: DictionaryMatchStatus;
  confidence: DictionaryMatchConfidence | null;
  dictionaryEntryId: string | null;
  /** The lookup form this resolution was reached through — persisted on the mapping so an admin can see what was searched. */
  lookupForm: string;
  reviewReason: MappingReviewReason | null;
}

function resolutionForNoMatch(
  lookupForm: string,
  isSourceDataImported: boolean,
): DictionaryMatchResolution {
  return {
    status: isSourceDataImported ? "unmatched" : "source_data_not_imported",
    confidence: null,
    dictionaryEntryId: null,
    lookupForm,
    reviewReason: null,
  };
}

/**
 * Confidence for a single surviving candidate. Ordered by how much
 * independent evidence agrees, never by a similarity score:
 *
 * - `high`   — the lookup form *is* the entry's headword, and the POS agrees.
 * - `medium` — headword match with no usable curriculum POS to corroborate,
 *              or an inflected-form match whose POS does agree.
 * - `low`    — an inflected-form match with no POS corroboration at all.
 */
function resolveConfidence(
  candidate: DictionaryMatchCandidate,
  curriculumPartOfSpeech: string | null,
): DictionaryMatchConfidence {
  const posAgrees =
    curriculumPartOfSpeech !== null &&
    candidate.partOfSpeech === curriculumPartOfSpeech;
  if (candidate.matchedVia === "lemma") return posAgrees ? "high" : "medium";
  return posAgrees ? "medium" : "low";
}

/**
 * Regional evidence as a tie-breaker only (spec 12 "RLA-ES"). It may promote
 * one candidate out of a tie when it is the only one recognized in the
 * primary region — it may never reject a candidate for merely being absent
 * from a word list, which is why `not_listed` alone never changes a status.
 */
function narrowByRegionalEvidence(
  candidates: DictionaryMatchCandidate[],
): DictionaryMatchCandidate[] {
  const recognized = candidates.filter(
    (candidate) => candidate.primaryRegionEvidence === "recognized",
  );
  if (recognized.length !== 1) return candidates;
  const everyOtherIsNotListed = candidates
    .filter((candidate) => candidate !== recognized[0])
    .every((candidate) => candidate.primaryRegionEvidence === "not_listed");
  return everyOtherIsNotListed ? recognized : candidates;
}

export function resolveDictionaryMatch(
  input: ResolveDictionaryMatchInput,
): DictionaryMatchResolution {
  const {
    lookupForms,
    candidates,
    curriculumPartOfSpeech,
    isSourceDataImported,
    primaryRegionCode,
  } = input;
  const fallbackLookupForm = lookupForms[0] ?? "";

  if (lookupForms.length === 0)
    return resolutionForNoMatch("", isSourceDataImported);

  // Take the first lookup form that reached anything at all. Because the
  // provider orders them most-specific-first, an exact phrase/expression
  // match always wins over the same phrase minus its article — spec 12's
  // "attempt exact phrase/expression matching first".
  const activeLookupForm = lookupForms.find((form) =>
    candidates.some((candidate) => candidate.matchedLookupForm === form),
  );
  if (activeLookupForm === undefined)
    return resolutionForNoMatch(fallbackLookupForm, isSourceDataImported);

  const isPhrase = isMultiwordForm(activeLookupForm);
  const ambiguityReason: MappingReviewReason = isPhrase
    ? "phrase_ambiguity"
    : "multiple_candidates";
  const reachedByActiveForm = candidates.filter(
    (candidate) => candidate.matchedLookupForm === activeLookupForm,
  );

  // Exact lemma candidates outrank form candidates for the same lookup form:
  // matching a headword is stronger evidence than matching one of its
  // inflections, and mixing the two would manufacture ambiguity that isn't
  // really there.
  const lemmaCandidates = reachedByActiveForm.filter(
    (candidate) => candidate.matchedVia === "lemma",
  );
  const tier =
    lemmaCandidates.length > 0 ? lemmaCandidates : reachedByActiveForm;

  // POS comparison. A curriculum POS that agrees with nothing is a genuine
  // conflict and goes to an admin — it usually means the curriculum item and
  // the dictionary entry are not actually the same word.
  let surviving = tier;
  if (curriculumPartOfSpeech !== null) {
    const posMatches = tier.filter(
      (candidate) => candidate.partOfSpeech === curriculumPartOfSpeech,
    );
    if (posMatches.length === 0) {
      return {
        status: "review_required",
        confidence: null,
        dictionaryEntryId: tier.length === 1 ? tier[0].entryId : null,
        lookupForm: activeLookupForm,
        reviewReason: "part_of_speech_conflict",
      };
    }
    surviving = posMatches;
  }

  if (surviving.length > 1) surviving = narrowByRegionalEvidence(surviving);

  if (surviving.length > 1) {
    return {
      status: "review_required",
      confidence: null,
      dictionaryEntryId: null,
      lookupForm: activeLookupForm,
      reviewReason: ambiguityReason,
    };
  }

  const [match] = surviving;

  // An entry Polyglot still references but the source no longer publishes is
  // never auto-adopted — spec 12 "Removed Entries and Senses".
  if (match.sourceStatus === "missing_from_source") {
    return {
      status: "review_required",
      confidence: null,
      dictionaryEntryId: match.entryId,
      lookupForm: activeLookupForm,
      reviewReason: "entry_missing_from_source",
    };
  }

  // A genuine regional restriction stated by the source itself — the entry is
  // labelled as belonging to other regions and not the one being taught.
  // This is positive evidence of a mismatch, unlike absence from a word list.
  const restrictedRegions = match.restrictedRegionCodes ?? [];
  if (
    primaryRegionCode &&
    restrictedRegions.length > 0 &&
    !restrictedRegions.includes(primaryRegionCode)
  ) {
    return {
      status: "review_required",
      confidence: null,
      dictionaryEntryId: match.entryId,
      lookupForm: activeLookupForm,
      reviewReason: "regional_mismatch",
    };
  }

  return {
    status: "auto_matched",
    confidence: resolveConfidence(match, curriculumPartOfSpeech),
    dictionaryEntryId: match.entryId,
    lookupForm: activeLookupForm,
    reviewReason: null,
  };
}
