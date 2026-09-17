import { describe, expect, it } from "vitest";

import type { DeckSummary } from "./deck-types";
import {
  deriveDeckContentType,
  filterDecks,
  matchesDeckContentFilter,
  matchesDeckSearch,
  parseDeckContentFilter,
} from "./deck-view";

function deck(overrides: Partial<DeckSummary> = {}): DeckSummary {
  return {
    id: "deck-1",
    kind: "personal",
    name: "Kitchen words",
    description: "Everyday cooking vocabulary",
    contentType: "vocabulary",
    itemCount: 12,
    ...overrides,
  };
}

describe("deriveDeckContentType", () => {
  it("reports the single type a deck actually contains", () => {
    expect(deriveDeckContentType({ vocabulary: 5, grammar: 0 })).toBe(
      "vocabulary",
    );
    expect(deriveDeckContentType({ vocabulary: 0, grammar: 3 })).toBe(
      "grammar",
    );
  });

  it("reports 'both' when vocabulary and grammar coexist in one deck", () => {
    expect(deriveDeckContentType({ vocabulary: 5, grammar: 3 })).toBe("both");
  });

  it("returns null when nothing is left — only reachable once every item has been archived", () => {
    expect(deriveDeckContentType({ vocabulary: 0, grammar: 0 })).toBeNull();
  });
});

describe("parseDeckContentFilter", () => {
  it("accepts the three real filter values", () => {
    expect(parseDeckContentFilter("vocabulary")).toBe("vocabulary");
    expect(parseDeckContentFilter("grammar")).toBe("grammar");
    expect(parseDeckContentFilter("both")).toBe("both");
  });

  it("falls back to 'all' for an absent or unrecognized search param", () => {
    expect(parseDeckContentFilter(undefined)).toBe("all");
    expect(parseDeckContentFilter("")).toBe("all");
    expect(parseDeckContentFilter("VOCABULARY")).toBe("all");
    expect(parseDeckContentFilter("../../etc")).toBe("all");
  });
});

describe("matchesDeckSearch", () => {
  it("matches case-insensitively across name and description", () => {
    expect(matchesDeckSearch(deck(), "KITCHEN")).toBe(true);
    expect(matchesDeckSearch(deck(), "cooking")).toBe(true);
  });

  it("matches a partial word, not just a whole one", () => {
    expect(matchesDeckSearch(deck(), "chen")).toBe(true);
  });

  it("ignores diacritics, so a deck named 'Comida rápida' is found by 'rapida'", () => {
    expect(
      matchesDeckSearch(
        deck({ name: "Comida rápida", description: null }),
        "rapida",
      ),
    ).toBe(true);
    expect(
      matchesDeckSearch(
        deck({ name: "Comida rapida", description: null }),
        "rápida",
      ),
    ).toBe(true);
  });

  it("treats an empty or whitespace-only query as no filter at all", () => {
    expect(matchesDeckSearch(deck(), "")).toBe(true);
    expect(matchesDeckSearch(deck(), "   ")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesDeckSearch(deck(), "subjunctive")).toBe(false);
  });

  it("handles a deck with no description", () => {
    expect(matchesDeckSearch(deck({ description: null }), "kitchen")).toBe(
      true,
    );
    expect(matchesDeckSearch(deck({ description: null }), "cooking")).toBe(
      false,
    );
  });
});

describe("matchesDeckContentFilter", () => {
  it("'all' matches everything, including a deck with no content type left", () => {
    expect(
      matchesDeckContentFilter(deck({ contentType: "grammar" }), "all"),
    ).toBe(true);
    expect(matchesDeckContentFilter(deck({ contentType: null }), "all")).toBe(
      true,
    );
  });

  it("matches on exact content type — a mixed deck answers 'both', never 'vocabulary'", () => {
    expect(
      matchesDeckContentFilter(deck({ contentType: "both" }), "both"),
    ).toBe(true);
    expect(
      matchesDeckContentFilter(deck({ contentType: "both" }), "vocabulary"),
    ).toBe(false);
    expect(
      matchesDeckContentFilter(deck({ contentType: "vocabulary" }), "both"),
    ).toBe(false);
  });

  it("a deck whose items were all archived matches only the unfiltered default", () => {
    expect(
      matchesDeckContentFilter(deck({ contentType: null }), "vocabulary"),
    ).toBe(false);
    expect(matchesDeckContentFilter(deck({ contentType: null }), "both")).toBe(
      false,
    );
  });
});

describe("filterDecks", () => {
  const decks = [
    deck({ id: "a", name: "Kitchen words", contentType: "vocabulary" }),
    deck({
      id: "b",
      name: "Kitchen grammar",
      contentType: "grammar",
      description: null,
    }),
    deck({
      id: "c",
      name: "Travel mix",
      contentType: "both",
      description: null,
    }),
  ];

  it("applies search and type filter together", () => {
    const result = filterDecks(decks, {
      search: "kitchen",
      contentFilter: "grammar",
    });
    expect(result.map((d) => d.id)).toEqual(["b"]);
  });

  it("returns everything when neither filter is set", () => {
    expect(
      filterDecks(decks, { search: "", contentFilter: "all" }),
    ).toHaveLength(3);
  });

  it("returns an empty list when nothing matches — the caller's empty state, not an error", () => {
    expect(
      filterDecks(decks, { search: "nothing here", contentFilter: "all" }),
    ).toEqual([]);
  });
});
