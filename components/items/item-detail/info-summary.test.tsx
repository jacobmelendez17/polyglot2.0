import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { InfoSummary } from "@/components/items/item-detail/info-summary";
import { buildItemDetailView } from "@/domains/curriculum";
import type { ItemDetailSource } from "@/domains/curriculum";

function vocabulary(
  overrides: Partial<Extract<ItemDetailSource, { type: "vocabulary" }>> = {},
): ItemDetailSource {
  return {
    type: "vocabulary",
    itemId: "item-1",
    levelNumber: 1,
    cefrLevel: null,
    register: "informal",
    patterns: [],
    examples: [],
    resources: [],
    displayWord: "el gato",
    translation: "cat",
    gender: "masculine",
    wordType: "noun",
    pronunciationGuide: "el GAH-toh",
    ipa: "/ˈɡa.to/",
    audioUrl: null,
    teachingDefinition: null,
    officialSynonyms: [],
    personalSynonyms: [],
    officialVariations: [],
    personalVariations: [],
    ...overrides,
  };
}

function renderSummary(source: ItemDetailSource) {
  return render(
    <InfoSummary view={buildItemDetailView(source)} languageCode="es-MX" />,
  );
}

describe("InfoSummary", () => {
  it("renders all four cards, including the empty ones", () => {
    renderSummary(vocabulary());

    for (const title of [
      "Details",
      "Pronunciation",
      "Synonyms",
      "Variations",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("No synonyms yet.")).toBeInTheDocument();
    expect(screen.getByText("No variations yet.")).toBeInTheDocument();
  });

  it("shows Gender and Register for vocabulary, and the word type with pronunciation", () => {
    renderSummary(vocabulary());

    expect(screen.getByText("Gender")).toBeInTheDocument();
    expect(screen.getByText("Masculine")).toBeInTheDocument();
    expect(screen.getByText("Informal")).toBeInTheDocument();
    expect(screen.getByText("Word Type")).toBeInTheDocument();
    expect(screen.getByText("noun")).toBeInTheDocument();
    expect(screen.getByText("/ˈɡa.to/")).toBeInTheDocument();
  });

  it("shows N/A for a word with no grammatical gender", () => {
    renderSummary(vocabulary({ gender: null }));
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("shows an em dash, not 'Neutral', for an unclassified register", () => {
    renderSummary(vocabulary({ register: null }));

    expect(screen.queryByText("Neutral")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("labels the learner's own synonyms rather than merging them into the official list", () => {
    renderSummary(
      vocabulary({ officialSynonyms: ["feline"], personalSynonyms: ["kitty"] }),
    );

    expect(screen.getByText("feline")).toBeInTheDocument();
    expect(screen.getByText("kitty")).toBeInTheDocument();
    // The distinction is carried by a text label, never by color alone.
    expect(screen.getByText("Yours")).toBeInTheDocument();
  });

  it("explains the absent pronunciation card for grammar instead of leaving it blank", () => {
    renderSummary({
      type: "grammar",
      itemId: "item-2",
      levelNumber: 1,
      cefrLevel: null,
      register: null,
      patterns: [],
      examples: [],
      resources: [],
      structure: "y",
      title: null,
      translation: "and",
      explanation: "Connects two words.",
      blocks: [],
      officialSynonyms: [],
      personalSynonyms: [],
    });

    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(
      screen.getByText("Grammar points are not pronounced as single words."),
    ).toBeInTheDocument();
  });
});
