import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DeckItemList } from "@/components/decks/deck-item-list";
import type { DeckItemRow } from "@/domains/decks";

const ITEMS: DeckItemRow[] = [
  { learningItemId: "v1", itemType: "vocabulary", primary: "el gato", secondary: "cat", srsStage: "familiar_1" },
  { learningItemId: "g1", itemType: "grammar", primary: "y", secondary: "and", srsStage: null },
];

describe("DeckItemList", () => {
  it("shows the word or grammar point, its translation, and its SRS stage", () => {
    render(<DeckItemList items={ITEMS} />);
    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.getByText("cat · Vocabulary")).toBeInTheDocument();
    expect(screen.getByText("Familiar 1")).toBeInTheDocument();
  });

  it("reads an item with no progress as 'Not started' rather than blank or an error", () => {
    render(<DeckItemList items={ITEMS} />);
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("lets vocabulary and grammar coexist, naming each type in text", () => {
    render(<DeckItemList items={ITEMS} />);
    expect(screen.getByText("cat · Vocabulary")).toBeInTheDocument();
    expect(screen.getByText("and · Grammar")).toBeInTheDocument();
  });

  it("links each row to the item's own page", () => {
    render(<DeckItemList items={ITEMS} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/items/v1");
    expect(links[1]).toHaveAttribute("href", "/items/g1");
  });
});
