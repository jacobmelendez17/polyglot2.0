import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { VocabularyItemDetail } from "@/components/items/vocabulary-item-detail";
import type { VocabularyDetail, VocabularyDetailDictionary } from "@/domains/lexicon";

function buildDetail(overrides: Partial<VocabularyDetail> = {}): VocabularyDetail {
  return {
    curriculum: {
      learningItemId: "item-1",
      displayWord: "el gato",
      translation: "cat",
      teachingSummary: "The general word for a domestic cat.",
      levelNumber: 1,
      groupName: "Animals",
      examples: [{ targetText: "El gato duerme.", translation: "The cat sleeps." }],
      creatorNotes: "Common first noun to teach.",
      manualPronunciation: null,
      manualIpa: null,
      partOfSpeech: "noun",
    },
    dictionary: null,
    progress: null,
    ...overrides,
  };
}

function buildDictionary(overrides: Partial<VocabularyDetailDictionary> = {}): VocabularyDetailDictionary {
  return {
    entryId: "entry-1",
    lemma: "gato",
    partOfSpeech: "noun",
    selectedSenses: [{ id: "sense-1", senseOrder: 0, gloss: "a small domesticated feline", tags: [], topics: [], sourceStatus: "active" }],
    allSenses: [],
    pronunciations: [{ id: "pron-1", ipa: "/ˈga.to/", regionCode: null, tags: [], audioUrl: null, sourceStatus: "active" }],
    preferredPronunciationId: "pron-1",
    forms: [],
    synonyms: [],
    variants: [],
    usageLabels: [],
    regionalEvidence: [],
    attribution: { sourceCode: "wiktionary_es", provider: "Wiktionary", attributionText: "From Wiktionary, CC BY-SA 4.0", sourceVersion: null },
    matchStatus: "manual",
    confidence: "high",
    ...overrides,
  };
}

describe("VocabularyItemDetail", () => {
  it("renders the curriculum half — word, translation, teaching meaning, examples, and notes — with no dictionary section when unmatched", () => {
    render(<VocabularyItemDetail detail={buildDetail()} status="published" />);

    expect(screen.getByRole("heading", { name: "el gato" })).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByText("The general word for a domestic cat.")).toBeInTheDocument();
    expect(screen.getByText("El gato duerme.")).toBeInTheDocument();
    expect(screen.getByText("Common first noun to teach.")).toBeInTheDocument();
    expect(screen.getByText(/Not yet studied/)).toBeInTheDocument();
    expect(screen.queryByText("Dictionary information")).not.toBeInTheDocument();
  });

  it("renders the dictionary section, and replaces the teaching meaning with the dictionary's sense, once the mapping is confirmed", () => {
    render(<VocabularyItemDetail detail={buildDetail({ dictionary: buildDictionary() })} status="published" />);

    expect(screen.getByText("Dictionary information")).toBeInTheDocument();
    // The confirmed sense replaces the admin's teaching note as the headline meaning
    // (and appears again inside the full dictionary record below — expected overlap).
    expect(screen.getAllByText("a small domesticated feline").length).toBeGreaterThan(0);
    expect(screen.queryByText("The general word for a domestic cat.")).not.toBeInTheDocument();
    // ...and carries attribution right alongside it, not only inside the panel below.
    expect(screen.getAllByText(/From Wiktionary, CC BY-SA 4.0/).length).toBeGreaterThan(0);
  });

  it("never shows the dictionary section or replaces the teaching meaning for an auto-matched, unreviewed mapping", () => {
    render(<VocabularyItemDetail detail={buildDetail({ dictionary: buildDictionary({ matchStatus: "auto_matched" }) })} status="published" />);

    expect(screen.queryByText("Dictionary information")).not.toBeInTheDocument();
    expect(screen.getByText("The general word for a domestic cat.")).toBeInTheDocument();
    expect(screen.queryByText("a small domesticated feline")).not.toBeInTheDocument();
  });
});
