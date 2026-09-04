import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelItemGrid } from "@/components/levels/level-item-grid";
import type { LevelCardItem } from "@/domains/curriculum";

const ITEMS: LevelCardItem[] = [
  { id: "1", itemType: "vocabulary", primary: "gato", secondary: "cat" },
  { id: "2", itemType: "vocabulary", primary: "perro", secondary: "dog" },
];

describe("LevelItemGrid", () => {
  it("renders every item as a card", () => {
    render(<LevelItemGrid items={ITEMS} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("default (normal) density renders the default grid layout classes", () => {
    const { container } = render(<LevelItemGrid items={ITEMS} />);
    expect(container.firstChild).toHaveClass("lg:grid-cols-8");
  });

  it("large mode changes the layout to fewer columns per row", () => {
    const { container } = render(<LevelItemGrid items={ITEMS} density="large" />);
    expect(container.firstChild).toHaveClass("lg:grid-cols-6");
  });

  it("compact mode changes the layout to more columns per row", () => {
    const { container } = render(<LevelItemGrid items={ITEMS} density="compact" />);
    expect(container.firstChild).toHaveClass("lg:grid-cols-10");
  });
});
