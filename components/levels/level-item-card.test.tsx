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
  displayState: "locked",
};
const GRAMMAR_ITEM: LevelCardItem = {
  id: "y-id",
  itemType: "grammar",
  primary: "y",
  secondary: "and",
  srsStage: null,
  displayState: "locked",
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

  it("fills the whole card with the real SRS stage color once learned", () => {
    render(
      <LevelItemCard
        item={{ ...VOCAB_ITEM, srsStage: "familiar_1", displayState: "learned" }}
      />,
    );
    expect(screen.getByRole("link")).toHaveClass("bg-srs-familiar");
  });

  it("uses a dashed, muted treatment for a locked item", () => {
    render(<LevelItemCard item={{ ...VOCAB_ITEM, displayState: "locked" }} />);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("border-dashed");
    expect(link).toHaveClass("bg-muted/40");
  });

  it("uses a light accent tint for an unlearned item in the active lesson", () => {
    render(<LevelItemCard item={{ ...VOCAB_ITEM, displayState: "inLesson" }} />);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("border-primary/50");
    expect(link).toHaveClass("bg-primary/10");
  });

  it("treats a learned item's stage as authoritative over its stored display state", () => {
    // A defensive edge case: a real progress row always wins, regardless of
    // what displayState says — see `level-item-style.ts`'s `levelItemStyle`.
    render(
      <LevelItemCard
        item={{ ...VOCAB_ITEM, srsStage: "fluent", displayState: "locked" }}
      />,
    );
    expect(screen.getByRole("link")).toHaveClass("bg-srs-fluent");
  });
});
