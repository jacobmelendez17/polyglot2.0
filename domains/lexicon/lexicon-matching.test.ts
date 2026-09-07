import { describe, expect, it } from "vitest";

import { resolveDictionaryMatch } from "./lexicon-matching";
import type { DictionaryMatchCandidate } from "./lexicon-matching";

/**
 * Spec 12's matching rules, exercised as pure decisions. Every case here is
 * one the spec names explicitly: exact lemma, form match, multiple
 * candidates, POS conflict, phrase handling, and each of the four mapping
 * states (plus the fifth, `source_data_not_imported`, which the spec
 * requires be distinguishable from `unmatched`).
 */

function candidate(overrides: Partial<DictionaryMatchCandidate> & Pick<DictionaryMatchCandidate, "entryId">): DictionaryMatchCandidate {
  return {
    partOfSpeech: "noun",
    sourceStatus: "active",
    matchedLookupForm: "padre",
    matchedVia: "lemma",
    ...overrides,
  };
}

describe("resolveDictionaryMatch", () => {
  it("auto-matches a single exact lemma candidate at high confidence when the POS agrees", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["el padre", "padre"],
      candidates: [candidate({ entryId: "entry-padre" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });

    expect(result).toEqual({
      status: "auto_matched",
      confidence: "high",
      dictionaryEntryId: "entry-padre",
      lookupForm: "padre",
      reviewReason: null,
    });
  });

  it("reports the lookup form the match was actually reached through", () => {
    // "el padre" found nothing; "padre" did. The persisted lookup form must
    // say so, or an admin cannot tell what was searched.
    const result = resolveDictionaryMatch({
      lookupForms: ["el padre", "padre"],
      candidates: [candidate({ entryId: "entry-padre", matchedLookupForm: "padre" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.lookupForm).toBe("padre");
  });

  it("prefers an exact phrase match over the same phrase minus its article", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["el padre", "padre"],
      candidates: [
        candidate({ entryId: "entry-phrase", matchedLookupForm: "el padre" }),
        candidate({ entryId: "entry-lemma", matchedLookupForm: "padre" }),
      ],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.dictionaryEntryId).toBe("entry-phrase");
    expect(result.lookupForm).toBe("el padre");
  });

  it("matches through an inflected form at medium confidence", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["padres"],
      candidates: [candidate({ entryId: "entry-padre", matchedLookupForm: "padres", matchedVia: "form" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("auto_matched");
    expect(result.confidence).toBe("medium");
  });

  it("drops to low confidence for a form match with no usable curriculum POS", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["padres"],
      candidates: [candidate({ entryId: "entry-padre", matchedLookupForm: "padres", matchedVia: "form" })],
      curriculumPartOfSpeech: null,
      isSourceDataImported: true,
    });
    expect(result.status).toBe("auto_matched");
    expect(result.confidence).toBe("low");
  });

  it("prefers a headword match over an inflected-form match rather than treating them as rival candidates", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["habla"],
      candidates: [
        candidate({ entryId: "entry-hablar", matchedLookupForm: "habla", matchedVia: "form", partOfSpeech: "verb" }),
        candidate({ entryId: "entry-habla-noun", matchedLookupForm: "habla", matchedVia: "lemma", partOfSpeech: "noun" }),
      ],
      curriculumPartOfSpeech: null,
      isSourceDataImported: true,
    });
    expect(result.status).toBe("auto_matched");
    expect(result.dictionaryEntryId).toBe("entry-habla-noun");
  });

  it("requires review when several entries match — never guesses between homonyms", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["coma"],
      candidates: [
        candidate({ entryId: "entry-coma-1", matchedLookupForm: "coma" }),
        candidate({ entryId: "entry-coma-2", matchedLookupForm: "coma" }),
      ],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewReason).toBe("multiple_candidates");
    expect(result.dictionaryEntryId).toBeNull();
    expect(result.confidence).toBeNull();
  });

  it("narrows by part of speech when the curriculum states one", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["rojo"],
      candidates: [
        candidate({ entryId: "entry-rojo-adj", matchedLookupForm: "rojo", partOfSpeech: "adjective" }),
        candidate({ entryId: "entry-rojo-noun", matchedLookupForm: "rojo", partOfSpeech: "noun" }),
      ],
      curriculumPartOfSpeech: "adjective",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("auto_matched");
    expect(result.dictionaryEntryId).toBe("entry-rojo-adj");
  });

  it("flags a POS conflict rather than adopting the only entry that exists", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["padre"],
      candidates: [candidate({ entryId: "entry-padre", partOfSpeech: "verb" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewReason).toBe("part_of_speech_conflict");
    // The candidate is still reported so an admin can see what was rejected.
    expect(result.dictionaryEntryId).toBe("entry-padre");
  });

  it("matches a multiword expression as a whole", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["buenos días"],
      candidates: [
        candidate({ entryId: "entry-buenos-dias", matchedLookupForm: "buenos días", partOfSpeech: "phrase" }),
      ],
      curriculumPartOfSpeech: "phrase",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("auto_matched");
    expect(result.dictionaryEntryId).toBe("entry-buenos-dias");
  });

  it("uses the phrase-specific review reason when an expression is ambiguous", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["buenos días"],
      candidates: [
        candidate({ entryId: "a", matchedLookupForm: "buenos días", partOfSpeech: "phrase" }),
        candidate({ entryId: "b", matchedLookupForm: "buenos días", partOfSpeech: "phrase" }),
      ],
      curriculumPartOfSpeech: "phrase",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewReason).toBe("phrase_ambiguity");
  });

  it("reports unmatched when the source was searched and had nothing", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["de nada"],
      candidates: [],
      curriculumPartOfSpeech: "phrase",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("unmatched");
    expect(result.dictionaryEntryId).toBeNull();
    expect(result.lookupForm).toBe("de nada");
  });

  it("distinguishes 'never imported' from 'searched and found nothing'", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["de nada"],
      candidates: [],
      curriculumPartOfSpeech: "phrase",
      isSourceDataImported: false,
    });
    expect(result.status).toBe("source_data_not_imported");
  });

  it("handles a vocabulary item with no derivable lookup form at all", () => {
    const result = resolveDictionaryMatch({
      lookupForms: [],
      candidates: [],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("unmatched");
    expect(result.lookupForm).toBe("");
  });

  it("never auto-adopts an entry the source has stopped publishing", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["padre"],
      candidates: [candidate({ entryId: "entry-padre", sourceStatus: "missing_from_source" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewReason).toBe("entry_missing_from_source");
  });

  it("uses regional evidence only to break a tie", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["coma"],
      candidates: [
        candidate({ entryId: "entry-known", matchedLookupForm: "coma", primaryRegionEvidence: "recognized" }),
        candidate({ entryId: "entry-other", matchedLookupForm: "coma", primaryRegionEvidence: "not_listed" }),
      ],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
      primaryRegionCode: "es-MX",
    });
    expect(result.status).toBe("auto_matched");
    expect(result.dictionaryEntryId).toBe("entry-known");
  });

  it("does not reject a lone candidate merely for being absent from a regional word list", () => {
    // Spec 12: absence is not sufficient proof that a form is invalid.
    const result = resolveDictionaryMatch({
      lookupForms: ["padre"],
      candidates: [candidate({ entryId: "entry-padre", primaryRegionEvidence: "not_listed" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
      primaryRegionCode: "es-MX",
    });
    expect(result.status).toBe("auto_matched");
    expect(result.confidence).toBe("high");
  });

  it("leaves an ambiguous pair ambiguous when regional evidence does not clearly separate them", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["coma"],
      candidates: [
        candidate({ entryId: "a", matchedLookupForm: "coma", primaryRegionEvidence: "recognized" }),
        candidate({ entryId: "b", matchedLookupForm: "coma", primaryRegionEvidence: "recognized" }),
      ],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
      primaryRegionCode: "es-MX",
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewReason).toBe("multiple_candidates");
  });

  it("flags an entry the source explicitly restricts to another region", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["ordenador"],
      candidates: [candidate({ entryId: "entry-ordenador", matchedLookupForm: "ordenador", restrictedRegionCodes: ["es-ES"] })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
      primaryRegionCode: "es-MX",
    });
    expect(result.status).toBe("review_required");
    expect(result.reviewReason).toBe("regional_mismatch");
  });

  it("does not flag a restriction that includes the region being taught", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["computadora"],
      candidates: [candidate({ entryId: "entry-computadora", matchedLookupForm: "computadora", restrictedRegionCodes: ["es-MX"] })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
      primaryRegionCode: "es-MX",
    });
    expect(result.status).toBe("auto_matched");
  });

  it("never selects a sense — resolution names an entry and nothing more", () => {
    const result = resolveDictionaryMatch({
      lookupForms: ["padre"],
      candidates: [candidate({ entryId: "entry-padre" })],
      curriculumPartOfSpeech: "noun",
      isSourceDataImported: true,
    });
    expect(Object.keys(result).sort()).toEqual(["confidence", "dictionaryEntryId", "lookupForm", "reviewReason", "status"]);
  });
});

/**
 * Not the matcher itself, but the same derivation the manual-mapping path
 * relies on: which of a display word's derived forms is the honest one to
 * record against a chosen entry.
 */
describe("lookup form recorded for a manual mapping", () => {
  function chooseLookupForm(lookups: string[], entryNormalizedLemma: string): string {
    return lookups.find((form) => form === entryNormalizedLemma) ?? lookups[0] ?? "";
  }

  it("records the lemma, not the article-composed display word", () => {
    expect(chooseLookupForm(["la coma", "coma"], "coma")).toBe("coma");
    expect(chooseLookupForm(["el padre", "padre"], "padre")).toBe("padre");
  });

  it("records the whole expression when the entry is the expression", () => {
    expect(chooseLookupForm(["buenos días"], "buenos días")).toBe("buenos días");
  });

  it("falls back to the display word when no derived form is the entry's lemma", () => {
    // An admin mapping "el padre" onto the entry "progenitor" is legitimate;
    // there is simply no derived form that equals it.
    expect(chooseLookupForm(["el padre", "padre"], "progenitor")).toBe("el padre");
  });
});
