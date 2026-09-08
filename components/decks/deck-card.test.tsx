import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DeckCard } from "@/components/decks/deck-card";
import type { DeckSummary } from "@/domains/decks";

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

describe("DeckCard", () => {
  it("shows the name, description, item count, and deck type", () => {
    render(<DeckCard deck={deck()} />);
    expect(screen.getByText("Kitchen words")).toBeInTheDocument();
    expect(screen.getByText("Everyday cooking vocabulary")).toBeInTheDocument();
    expect(screen.getByText("12 items · Vocabulary")).toBeInTheDocument();
  });

  it("opens the deck's detail route", () => {
    render(<DeckCard deck={deck()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/decks/deck-1");
  });

  it("names the type in text, never by color alone", () => {
    render(<DeckCard deck={deck({ contentType: "both", itemCount: 1 })} />);
    expect(screen.getByText("1 item · Vocabulary & Grammar")).toBeInTheDocument();
  });

  it("renders a deck with no description without an empty paragraph", () => {
    render(<DeckCard deck={deck({ description: null })} />);
    expect(screen.queryByText("Everyday cooking vocabulary")).not.toBeInTheDocument();
    expect(screen.getByText("Kitchen words")).toBeInTheDocument();
  });

  it("handles a theme deck the learner has not reached any of yet", () => {
    render(<DeckCard deck={deck({ kind: "polyglot", itemCount: 0, contentType: "grammar" })} />);
    expect(screen.getByText("0 items · Grammar")).toBeInTheDocument();
  });
});
