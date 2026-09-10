import { describe, expect, it } from "vitest";

import { resolveVocabularyPresentation } from "./lexicon-read-model";
import type { VocabularyDetailCurriculum, VocabularyDetailDictionary } from "./lexicon-read-model";

function curriculum(overrides: Partial<VocabularyDetailCurriculum> = {}): VocabularyDetailCurriculum {
  return {
    learningItemId: "item-1",
    displayWord: "el gato",
    translation: "cat",
    teachingSummary: "Admin-written teaching note.",
    levelNumber: 1,
    groupName: "Home & Basics",
    usageContexts: [],
    examples: [],
    creatorNotes: null,
    manualPronunciation: "GAH-toh",
    manualIpa: "admin-typed-ipa",
    partOfSpeech: "noun",
    ...overrides,
  };
}

function dictionary(overrides: Partial<VocabularyDetailDictionary> = {}): VocabularyDetailDictionary {
  return {
    entryId: "entry-1",
    lemma: "gato",
    partOfSpeech: "noun",
    selectedSenses: [{ id: "sense-1", senseOrder: 0, gloss: "a domestic cat", tags: [], topics: [], sourceStatus: "active" }],
    allSenses: [],
    pronunciations: [{ id: "pron-1", ipa: "/ˈga.to/", regionCode: null, tags: [], audioUrl: null, sourceStatus: "active" }],
    preferredPronunciationId: "pron-1",
    forms: [],
    synonyms: [],
    variants: [],
    usageLabels: [],
    regionalEvidence: [],
    attribution: null,
    matchStatus: "manual",
    confidence: "high",
    ...overrides,
  };
}

describe("resolveVocabularyPresentation", () => {
  it("falls back to the curriculum's own fields when there is no dictionary mapping at all", () => {
    const result = resolveVocabularyPresentation({ curriculum: curriculum(), dictionary: null });
    expect(result).toEqual({
      definition: "Admin-written teaching note.",
      definitionSource: "curriculum",
      ipa: "admin-typed-ipa",
      ipaSource: "curriculum",
    });
  });

  it("ignores an auto_matched mapping that no admin has confirmed — never surfaces an unreviewed guess", () => {
    const result = resolveVocabularyPresentation({ curriculum: curriculum(), dictionary: dictionary({ matchStatus: "auto_matched" }) });
    expect(result.definitionSource).toBe("curriculum");
    expect(result.ipaSource).toBe("curriculum");
  });

  it("uses the dictionary's primary sense and preferred pronunciation once the mapping is confirmed", () => {
    const result = resolveVocabularyPresentation({ curriculum: curriculum(), dictionary: dictionary() });
    expect(result).toEqual({
      definition: "a domestic cat",
      definitionSource: "dictionary",
      ipa: "/ˈga.to/",
      ipaSource: "dictionary",
    });
  });

  it("confirming a mapping wins even over an already-typed admin value — it isn't just a gap-filler", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum({ teachingSummary: "A pre-existing admin note.", manualIpa: "pre-existing-ipa" }),
      dictionary: dictionary(),
    });
    expect(result.definition).toBe("a domestic cat");
    expect(result.ipa).toBe("/ˈga.to/");
  });

  it("falls back to the curriculum definition when a confirmed mapping has no selected senses", () => {
    const result = resolveVocabularyPresentation({ curriculum: curriculum(), dictionary: dictionary({ selectedSenses: [] }) });
    expect(result.definition).toBe("Admin-written teaching note.");
    expect(result.definitionSource).toBe("curriculum");
  });

  it("falls back to the curriculum IPA when a confirmed mapping has no pronunciations", () => {
    const result = resolveVocabularyPresentation({ curriculum: curriculum(), dictionary: dictionary({ pronunciations: [], preferredPronunciationId: null }) });
    expect(result.ipa).toBe("admin-typed-ipa");
    expect(result.ipaSource).toBe("curriculum");
  });

  it("falls back to the first pronunciation when the preferred id doesn't match any of them", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum(),
      dictionary: dictionary({ preferredPronunciationId: "does-not-exist" }),
    });
    expect(result.ipa).toBe("/ˈga.to/");
  });

  it("reports 'none' when neither side has anything", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum({ teachingSummary: null, manualIpa: null }),
      dictionary: null,
    });
    expect(result).toEqual({ definition: null, definitionSource: "none", ipa: null, ipaSource: "none" });
  });
});
