import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { VocabularyItemDetail } from "@/components/items/vocabulary-item-detail";
import type { VocabularyDetail } from "@/domains/lexicon";

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

  it("renders the dictionary section, clearly separated, when the item is mapped", () => {
    render(
      <VocabularyItemDetail
        detail={buildDetail({
          dictionary: {
            entryId: "entry-1",
            lemma: "gato",
            partOfSpeech: "noun",
            selectedSenses: [{ id: "sense-1", senseOrder: 0, gloss: "a small domesticated feline", tags: [], topics: [], sourceStatus: "active" }],
            allSenses: [],
            pronunciations: [],
            preferredPronunciationId: null,
            forms: [],
            synonyms: [],
            variants: [],
            usageLabels: [],
            regionalEvidence: [],
            attribution: { sourceCode: "wiktionary_es", provider: "Wiktionary", attributionText: "From Wiktionary, CC BY-SA 4.0", sourceVersion: null },
            matchStatus: "auto_matched",
            confidence: "high",
          },
        })}
        status="published"
      />,
    );

    expect(screen.getByText("Dictionary information")).toBeInTheDocument();
    expect(screen.getByText(/a small domesticated feline/)).toBeInTheDocument();
  });
});
