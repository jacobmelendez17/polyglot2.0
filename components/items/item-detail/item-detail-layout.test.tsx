import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ItemDetailLayout } from "@/components/items/item-detail/item-detail-layout";
import { buildItemDetailView } from "@/domains/curriculum";
import type {
  ItemDetailSource,
  ItemNavigationView,
} from "@/domains/curriculum";
import type { ItemProgress } from "@/domains/progress";

function vocabularySource(
  overrides: Partial<Extract<ItemDetailSource, { type: "vocabulary" }>> = {},
): ItemDetailSource {
  return {
    type: "vocabulary",
    itemId: "item-1",
    levelNumber: 1,
    cefrLevel: "A1",
    register: "neutral",
    patterns: [],
    examples: [
      {
        id: "example-1",
        targetText: "El gato duerme.",
        translation: "The cat sleeps.",
        patternId: null,
      },
    ],
    resources: [],
    displayWord: "el gato",
    translation: "cat",
    gender: "masculine",
    wordType: "noun",
    pronunciationGuide: "el GAH-toh",
    ipa: "/ˈɡa.to/",
    audioUrl: null,
    teachingDefinition: "A common household animal.",
    officialSynonyms: [],
    personalSynonyms: [],
    officialVariations: [],
    personalVariations: [],
    ...overrides,
  };
}

function grammarSource(
  overrides: Partial<Extract<ItemDetailSource, { type: "grammar" }>> = {},
): ItemDetailSource {
  return {
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
    explanation: "Connects two words or clauses.",
    blocks: [],
    officialSynonyms: [],
    personalSynonyms: [],
    ...overrides,
  };
}

const navigation: ItemNavigationView = {
  position: 1,
  total: 12,
  previousItemId: "item-last",
  nextItemId: "item-2",
  scopeLabel: "Home & Basics",
};

function progress(overrides: Partial<ItemProgress> = {}): ItemProgress {
  return {
    userId: "user-1",
    learningItemId: "item-1",
    languageId: "lang-1",
    srsStage: "beginner_2",
    learnedAt: new Date("2026-09-01T00:00:00Z"),
    nextReviewAt: new Date("2026-09-10T00:00:00Z"),
    fluentAt: null,
    correctCount: 3,
    incorrectCount: 1,
    reviewCount: 4,
    lastReviewedAt: new Date("2026-09-09T00:00:00Z"),
    currentCorrectStreak: 3,
    highestSrsStageReached: "beginner_2",
    version: 1,
    ...overrides,
  };
}

function renderPage(
  source: ItemDetailSource,
  extra: Partial<Parameters<typeof ItemDetailLayout>[0]> = {},
) {
  return render(
    <ItemDetailLayout
      view={buildItemDetailView(source)}
      navigation={navigation}
      languageCode="es-MX"
      mode="page"
      progress={progress()}
      levelUnlockedAt={new Date("2026-09-01T00:00:00Z")}
      timeZone="UTC"
      now={new Date("2026-09-09T00:00:00Z")}
      hrefForItem={(id) => `/items/${id}`}
      {...extra}
    />,
  );
}

describe("ItemDetailLayout — hero", () => {
  it("shows the kind label, CEFR band, level, and position", () => {
    renderPage(vocabularySource());

    expect(screen.getByText("Vocabulary Info")).toBeInTheDocument();
    expect(screen.getByText("A1 · Level 1 · 1/12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "el gato",
    );
    // Twice: the hero, and the sticky header's copy of it.
    expect(screen.getAllByText("cat")).toHaveLength(2);
  });

  it("omits the CEFR band rather than guessing one when the level has none", () => {
    renderPage(grammarSource());

    expect(screen.getByText("Level 1 · 1/12")).toBeInTheDocument();
    expect(screen.getByText("Grammar Info")).toBeInTheDocument();
  });

  it("wraps the arrows around the ends of the set", () => {
    renderPage(vocabularySource());

    expect(
      screen.getByRole("link", { name: "Previous item in Home & Basics" }),
    ).toHaveAttribute("href", "/items/item-last");
    expect(
      screen.getByRole("link", { name: "Next item in Home & Basics" }),
    ).toHaveAttribute("href", "/items/item-2");
  });

  it("renders no arrows for an item with nowhere to navigate", () => {
    renderPage(vocabularySource(), { navigation: null });

    expect(
      screen.queryByRole("link", { name: /Previous item/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("A1 · Level 1")).toBeInTheDocument();
  });
});

describe("ItemDetailLayout — sections", () => {
  it("renders Info, Examples, Progress, and Resources on the item page", () => {
    renderPage(vocabularySource());

    for (const label of ["Info", "Examples", "Progress", "Resources"]) {
      // Two tab rows render: the card's own and the sticky header's copy.
      expect(
        screen.getAllByRole("button", { name: label }).length,
      ).toBeGreaterThan(0);
    }
    expect(
      screen.getByRole("heading", { name: "Your Progress" }),
    ).toBeInTheDocument();
  });

  it("hides Progress entirely in lesson mode (spec 18)", () => {
    render(
      <ItemDetailLayout
        view={buildItemDetailView(vocabularySource())}
        navigation={null}
        languageCode="es-MX"
        mode="lesson"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Progress" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Your Progress" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Info" }).length,
    ).toBeGreaterThan(0);
  });

  it("titles the About card by item type", () => {
    renderPage(vocabularySource());
    expect(
      screen.getByRole("heading", { name: "Definition" }),
    ).toBeInTheDocument();

    renderPage(grammarSource({ title: "Ser vs. estar" }));
    expect(
      screen.getByRole("heading", { name: "About Ser vs. estar" }),
    ).toBeInTheDocument();
  });

  it("omits the Context card for an item with no patterns configured", () => {
    renderPage(vocabularySource());
    expect(screen.queryByText("Pattern of Use")).not.toBeInTheDocument();
  });

  it("renders the Context card when the item has patterns", () => {
    renderPage(
      vocabularySource({
        patterns: [{ id: "pattern-1", label: "como", note: null }],
        examples: [
          {
            id: "example-1",
            targetText: "Como pan.",
            translation: "I eat bread.",
            patternId: "pattern-1",
          },
        ],
      }),
    );

    expect(screen.getByText("Pattern of Use")).toBeInTheDocument();
    expect(screen.getByText("Common Combinations")).toBeInTheDocument();
  });
});

describe("ItemDetailLayout — Back to Top", () => {
  it("is present but inert while the hero is still visible", () => {
    renderPage(vocabularySource());

    const backToTop = screen.getByText("Back to Top").closest("button");
    expect(backToTop).toHaveClass("opacity-0");
    expect(backToTop).toHaveAttribute("tabindex", "-1");
  });
});
