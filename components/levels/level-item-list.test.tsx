import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelItemList } from "@/components/levels/level-item-list";
import type { LevelCardItem } from "@/domains/curriculum";

const ITEMS: LevelCardItem[] = [
  {
    id: "1",
    itemType: "vocabulary",
    primary: "el gato",
    secondary: "cat",
    srsStage: "familiar_1",
  },
  {
    id: "2",
    itemType: "vocabulary",
    primary: "el perro",
    secondary: "dog",
    srsStage: null,
  },
  {
    id: "3",
    itemType: "grammar",
    primary: "y",
    secondary: "and",
    srsStage: null,
  },
];

describe("LevelItemList", () => {
  it("renders one clickable row per item, separating the primary item from its translation", () => {
    render(<LevelItemList items={ITEMS} />);

    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute("href", "/items/1");
    expect(screen.getByText("el gato")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("shows each row's real SRS stage as a filled dot, and a dashed outline when not learned yet", () => {
    render(<LevelItemList items={ITEMS} />);
    const rows = screen.getAllByRole("link");
    const dot = (row: HTMLElement) => row.querySelector("span[aria-hidden]");

    expect(dot(rows[0])).toHaveClass("bg-srs-familiar");
    expect(dot(rows[1])).toHaveClass("border-dashed");
  });

  it("keeps the fixed content-type accent as the row's left border (ui-context.md's blue/red invariant)", () => {
    render(<LevelItemList items={ITEMS} />);
    const rows = screen.getAllByRole("link");
    expect(rows[0]).toHaveClass("border-l-learning-vocabulary");
    expect(rows[2]).toHaveClass("border-l-learning-grammar");
  });
});
