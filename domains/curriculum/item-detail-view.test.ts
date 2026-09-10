import { describe, expect, it } from "vitest";

import {
  buildItemDetailView,
  buildItemNavigation,
  EMPTY_FIELD,
  GENERAL_PATTERN_ID,
  itemDetailSections,
  NOT_APPLICABLE_FIELD,
} from "./item-detail-view";
import type { ItemDetailSource } from "./item-detail-view";

function vocabularySource(overrides: Partial<Extract<ItemDetailSource, { type: "vocabulary" }>> = {}): ItemDetailSource {
  return {
    type: "vocabulary",
    itemId: "item-1",
    levelNumber: 1,
    cefrLevel: "A1",
    register: null,
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
    teachingDefinition: "A cat.",
    dictionarySenses: [],
    attribution: null,
    officialSynonyms: [],
    personalSynonyms: [],
    officialVariations: [],
    personalVariations: [],
    ...overrides,
  };
}

function grammarSource(overrides: Partial<Extract<ItemDetailSource, { type: "grammar" }>> = {}): ItemDetailSource {
  return {
    type: "grammar",
    itemId: "item-2",
    levelNumber: 1,
    cefrLevel: null,
    register: "formal",
    patterns: [],
    examples: [],
    resources: [],
    structure: "ser",
    title: null,
    translation: "to be",
    explanation: "Permanent states.",
    blocks: [],
    officialSynonyms: [],
    personalSynonyms: [],
    ...overrides,
  };
}

describe("itemDetailSections", () => {
  it("hides Progress during a lesson (spec 18)", () => {
    expect(itemDetailSections("lesson")).toEqual(["info", "examples", "resources"]);
    expect(itemDetailSections("page")).toEqual(["info", "examples", "progress", "resources"]);
  });
});

describe("buildItemDetailView — vocabulary", () => {
  it("shows Gender and Register in Details, and Word Type with pronunciation", () => {
    const view = buildItemDetailView(vocabularySource({ register: "informal" }));

    expect(view.kindLabel).toBe("Vocabulary Info");
    expect(view.headline).toBe("el gato");
    expect(view.details).toEqual([
      { label: "Gender", value: "Masculine" },
      { label: "Register", value: "Informal" },
    ]);
    expect(view.pronunciation).toMatchObject({ wordType: "noun", ipa: "/ˈɡa.to/", spokenText: "el gato" });
  });

  it("shows N/A for a word with no grammatical gender, and an em dash for an unclassified register", () => {
    const view = buildItemDetailView(vocabularySource({ gender: null, register: null }));

    expect(view.details).toEqual([
      { label: "Gender", value: NOT_APPLICABLE_FIELD },
      { label: "Register", value: EMPTY_FIELD },
    ]);
  });

  it("titles the About card Definition and keeps dictionary senses out of Polyglot's teaching text", () => {
    const view = buildItemDetailView(
      vocabularySource({
        teachingDefinition: "Polyglot's explanation.",
        dictionarySenses: [{ id: "sense-1", gloss: "a small domesticated feline", tags: ["animal"] }],
        attribution: "From Wiktionary, CC BY-SA 4.0",
      }),
    );

    expect(view.about.title).toBe("Definition");
    expect(view.about.body).toBe("Polyglot's explanation.");
    expect(view.about.dictionarySenses).toHaveLength(1);
    expect(view.about.attribution).toBe("From Wiktionary, CC BY-SA 4.0");
  });

  it("keeps personal synonyms and variations separate from official ones", () => {
    const view = buildItemDetailView(
      vocabularySource({
        officialSynonyms: ["feline"],
        personalSynonyms: ["kitty"],
        officialVariations: ["gata"],
        personalVariations: ["gatito"],
      }),
    );

    expect(view.synonyms).toEqual({ official: ["feline"], personal: ["kitty"] });
    expect(view.variations).toEqual({ official: ["gata"], personal: ["gatito"] });
  });
});

describe("buildItemDetailView — grammar", () => {
  it("titles the About card after the grammar point, preferring its longer title", () => {
    expect(buildItemDetailView(grammarSource()).about.title).toBe("About ser");
    expect(buildItemDetailView(grammarSource({ title: "Ser vs. estar" })).about.title).toBe("About Ser vs. estar");
  });

  it("shows Structure and Register, and never a pronunciation card", () => {
    const view = buildItemDetailView(grammarSource());

    expect(view.kindLabel).toBe("Grammar Info");
    expect(view.details).toEqual([
      { label: "Structure", value: "ser" },
      { label: "Register", value: "Formal" },
    ]);
    expect(view.pronunciation).toBeNull();
  });

  it("falls back to the legacy explanation only when no content blocks are authored", () => {
    expect(buildItemDetailView(grammarSource()).about.body).toBe("Permanent states.");

    const withBlocks = buildItemDetailView(
      grammarSource({ blocks: [{ id: "block-1", position: 1, type: "text", body: "Use ser for identity." }] }),
    );
    expect(withBlocks.about.body).toBeNull();
    expect(withBlocks.about.blocks).toHaveLength(1);
  });

  it("orders content blocks by position, not by the order they arrived in", () => {
    const view = buildItemDetailView(
      grammarSource({
        blocks: [
          { id: "block-2", position: 2, type: "note", body: "Watch out for estar." },
          { id: "block-1", position: 1, type: "text", body: "Use ser for identity." },
          { id: "block-3", position: 3, type: "example", targetText: "Soy alto.", translation: "I am tall." },
        ],
      }),
    );

    expect(view.about.blocks.map((block) => block.id)).toEqual(["block-1", "block-2", "block-3"]);
  });
});

describe("buildItemDetailView — patterns of use", () => {
  const patterns = [
    { id: "pattern-1", label: "como", note: "first-person singular" },
    { id: "pattern-2", label: "comes", note: null },
  ];
  const examples = [
    { id: "example-1", targetText: "Como pan.", translation: "I eat bread.", patternId: "pattern-1" },
    { id: "example-2", targetText: "Comes mucho.", translation: "You eat a lot.", patternId: "pattern-2" },
  ];

  it("groups examples under their pattern and keeps a pattern with no examples yet", () => {
    const view = buildItemDetailView(vocabularySource({ patterns, examples: [examples[0]] }));

    expect(view.patterns.map((pattern) => pattern.label)).toEqual(["como", "comes"]);
    expect(view.patterns[0].examples.map((example) => example.id)).toEqual(["example-1"]);
    expect(view.patterns[1].examples).toEqual([]);
  });

  it("adds a General tab only when an example belongs to no pattern", () => {
    const withoutGeneral = buildItemDetailView(vocabularySource({ patterns, examples }));
    expect(withoutGeneral.patterns.map((pattern) => pattern.id)).toEqual(["pattern-1", "pattern-2"]);

    const withGeneral = buildItemDetailView(
      vocabularySource({
        patterns,
        examples: [...examples, { id: "example-3", targetText: "Comer es vivir.", translation: "To eat is to live.", patternId: null }],
      }),
    );
    expect(withGeneral.patterns.at(-1)).toMatchObject({ id: GENERAL_PATTERN_ID, label: "General" });
  });

  it("renders no pattern tabs at all for an item with examples but no patterns", () => {
    const view = buildItemDetailView(
      vocabularySource({ examples: [{ id: "example-1", targetText: "El gato duerme.", translation: "The cat sleeps.", patternId: null }] }),
    );

    expect(view.patterns).toEqual([]);
    expect(view.examples).toHaveLength(1);
  });

  it("lists every example in the Examples section regardless of pattern grouping", () => {
    const view = buildItemDetailView(vocabularySource({ patterns, examples }));

    expect(view.examples.map((example) => example.id)).toEqual(["example-1", "example-2"]);
  });
});

describe("buildItemNavigation", () => {
  const ids = ["a", "b", "c"];

  it("reports a 1-based position within its scope", () => {
    expect(buildItemNavigation(ids, "b", "Home & Basics")).toMatchObject({ position: 2, total: 3, scopeLabel: "Home & Basics" });
  });

  it("wraps in both directions (spec 18)", () => {
    expect(buildItemNavigation(ids, "a", "scope")).toMatchObject({ previousItemId: "c", nextItemId: "b" });
    expect(buildItemNavigation(ids, "c", "scope")).toMatchObject({ previousItemId: "b", nextItemId: "a" });
  });

  it("returns null when there is nowhere to navigate", () => {
    expect(buildItemNavigation(["a"], "a", "scope")).toBeNull();
    expect(buildItemNavigation([], "a", "scope")).toBeNull();
    expect(buildItemNavigation(ids, "missing", "scope")).toBeNull();
  });
});
