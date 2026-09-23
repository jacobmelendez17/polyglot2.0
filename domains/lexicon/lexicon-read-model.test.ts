import { describe, expect, it } from "vitest";

import { resolveVocabularyPresentation } from "./lexicon-read-model";
import type {
  VocabularyDetailCurriculum,
  VocabularyDetailDictionary,
} from "./lexicon-read-model";

function curriculum(
  overrides: Partial<VocabularyDetailCurriculum> = {},
): VocabularyDetailCurriculum {
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

function dictionary(
  overrides: Partial<VocabularyDetailDictionary> = {},
): VocabularyDetailDictionary {
  return {
    entryId: "entry-1",
    lemma: "gato",
    partOfSpeech: "noun",
    selectedSenses: [
      {
        id: "sense-1",
        senseOrder: 0,
        gloss: "a domestic cat",
        tags: [],
        topics: [],
        sourceStatus: "active",
      },
    ],
    allSenses: [],
    pronunciations: [
      {
        id: "pron-1",
        ipa: "/ˈga.to/",
        regionCode: null,
        tags: [],
        audioUrl: null,
        sourceStatus: "active",
      },
    ],
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
    const result = resolveVocabularyPresentation({
      curriculum: curriculum(),
      dictionary: null,
    });
    expect(result).toEqual({
      definition: "Admin-written teaching note.",
      definitionSource: "curriculum",
      ipa: "admin-typed-ipa",
      ipaSource: "curriculum",
    });
  });

  it("ignores an auto_matched mapping that no admin has confirmed — never surfaces an unreviewed guess", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum(),
      dictionary: dictionary({ matchStatus: "auto_matched" }),
    });
    expect(result.definitionSource).toBe("curriculum");
    expect(result.ipaSource).toBe("curriculum");
  });

  it("uses the dictionary's preferred pronunciation once the mapping is confirmed, but never its sense for the definition", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum(),
      dictionary: dictionary(),
    });
    expect(result).toEqual({
      definition: "Admin-written teaching note.",
      definitionSource: "curriculum",
      ipa: "/ˈga.to/",
      ipaSource: "dictionary",
    });
  });

  it("never lets a confirmed mapping replace an already-typed admin definition — reverted 2026-09-07's 'confirming wins' rule", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum({
        teachingSummary: "A pre-existing admin note.",
        manualIpa: "pre-existing-ipa",
      }),
      dictionary: dictionary(),
    });
    expect(result.definition).toBe("A pre-existing admin note.");
    // IPA precedence is unchanged by that reversion — a pronunciation is a
    // fact about the word, not authored prose.
    expect(result.ipa).toBe("/ˈga.to/");
  });

  it("still reports 'none' when there is no stored definition, confirmed mapping or not", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum({ teachingSummary: null }),
      dictionary: dictionary({ selectedSenses: [] }),
    });
    expect(result.definition).toBeNull();
    expect(result.definitionSource).toBe("none");
  });

  it("falls back to the curriculum IPA when a confirmed mapping has no pronunciations", () => {
    const result = resolveVocabularyPresentation({
      curriculum: curriculum(),
      dictionary: dictionary({
        pronunciations: [],
        preferredPronunciationId: null,
      }),
    });
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
    expect(result).toEqual({
      definition: null,
      definitionSource: "none",
      ipa: null,
      ipaSource: "none",
    });
  });
});
