import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DeckItemRow } from "@/domains/decks";

import { deckAvailabilityText } from "./deck-availability-text";
import { PolyglotDeckView } from "./polyglot-deck-view";

const item = (
  n: number,
  overrides: Partial<DeckItemRow> = {},
): DeckItemRow => ({
  learningItemId: `i0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  itemType: "vocabulary",
  primary: `palabra ${n}`,
  secondary: `word ${n}`,
  srsStage: null,
  ...overrides,
});

describe("deckAvailabilityText", () => {
  it("says when learners see a deck, in the words the decks list has always used", () => {
    expect(
      deckAvailabilityText({ availability: "theme", gateLevelNumber: null }),
    ).toBe("Theme — reveals learned items");
    expect(
      deckAvailabilityText({ availability: "level", gateLevelNumber: 4 }),
    ).toBe("Hidden until Level 4");
    // A level deck whose gate has vanished still says something honest.
    expect(
      deckAvailabilityText({ availability: "level", gateLevelNumber: null }),
    ).toBe("Hidden until Level ?");
  });
});

describe("PolyglotDeckView — what a writer sees where an Admin has the editor", () => {
  it("shows the details, when learners see the deck, and the items in their order", () => {
    render(
      <PolyglotDeckView
        description="Colors and shapes"
        availability="level"
        gateLevelNumber={3}
        items={[item(2), item(1, { itemType: "grammar", secondary: "a rule" })]}
      />,
    );

    expect(screen.getByText("Colors and shapes")).toBeVisible();
    expect(screen.getByText("Hidden until Level 3")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Items (2)" })).toBeVisible();
    const rows = screen.getAllByRole("listitem");
    // The order given — the deck's own — never a re-sort.
    expect(
      rows.map((row) => within(row).getByText(/^palabra/).textContent),
    ).toEqual(["palabra 2", "palabra 1"]);
    expect(within(rows[0]!).getByText(/Vocabulary/)).toBeVisible();
    expect(within(rows[1]!).getByText(/a rule · Grammar/)).toBeVisible();
  });

  it("says so when a deck has no description", () => {
    render(
      <PolyglotDeckView
        description={null}
        availability="theme"
        gateLevelNumber={null}
        items={[item(1)]}
      />,
    );
    expect(
      screen.getByText("Description").nextElementSibling,
    ).toHaveTextContent("—");
  });

  it("has nothing to press or type into — there is nothing here to save, add, reorder or delete", () => {
    render(
      <PolyglotDeckView
        description="x"
        availability="theme"
        gateLevelNumber={null}
        items={[item(1), item(2)]}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
