import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelItemCard } from "@/components/levels/level-item-card";
import type { LevelCardItem } from "@/domains/curriculum";

const VOCAB_ITEM: LevelCardItem = {
  id: "gato-id",
  itemType: "vocabulary",
  primary: "el gato",
  secondary: "cat",
  srsStage: null,
};
const GRAMMAR_ITEM: LevelCardItem = {
  id: "y-id",
  itemType: "grammar",
  primary: "y",
  secondary: "and",
  srsStage: null,
};

describe("LevelItemCard", () => {
  it("shows the primary item and its translation/description", () => {
    render(<LevelItemCard item={VOCAB_ITEM} />);
    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("links to the item's stable-identity route, not a curriculum-position route", () => {
    render(<LevelItemCard item={VOCAB_ITEM} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/items/gato-id");
  });

  it("has a meaningful accessible label, not just 'Card' (spec 10 §31)", () => {
    render(<LevelItemCard item={VOCAB_ITEM} />);
    expect(
      screen.getByRole("link", { name: "View el gato — cat" }),
    ).toBeInTheDocument();
  });

  it("works the same way for a grammar item", () => {
    render(<LevelItemCard item={GRAMMAR_ITEM} />);
    expect(screen.getByRole("link", { name: "View y — and" })).toHaveAttribute(
      "href",
      "/items/y-id",
    );
  });

  it("colors the accent by SRS stage, not content type (spec 26)", () => {
    render(<LevelItemCard item={{ ...VOCAB_ITEM, srsStage: "familiar_1" }} />);
    expect(screen.getByRole("link")).toHaveClass("border-t-srs-familiar");
  });

  it("uses a neutral accent for an item that has not been learned yet", () => {
    render(<LevelItemCard item={VOCAB_ITEM} />);
    expect(screen.getByRole("link")).toHaveClass("border-t-border");
  });
});
