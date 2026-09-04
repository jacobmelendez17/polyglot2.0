import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelItemList } from "@/components/levels/level-item-list";
import type { LevelCardItem } from "@/domains/curriculum";

const ITEMS: LevelCardItem[] = [
  { id: "1", itemType: "vocabulary", primary: "el gato", secondary: "cat" },
  { id: "2", itemType: "vocabulary", primary: "el perro", secondary: "dog" },
];

describe("LevelItemList", () => {
  it("renders one clickable row per item, separating the primary item from its translation", () => {
    render(<LevelItemList items={ITEMS} />);

    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "/items/1");
    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });
});
