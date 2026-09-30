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
    displayState: "learned",
  },
  {
    id: "2",
    itemType: "vocabulary",
    primary: "el perro",
    secondary: "dog",
    srsStage: null,
    displayState: "inLesson",
  },
  {
    id: "3",
    itemType: "grammar",
    primary: "y",
    secondary: "and",
    srsStage: null,
    displayState: "locked",
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

  it("fills each row with its real SRS stage, or the locked/in-lesson treatment", () => {
    render(<LevelItemList items={ITEMS} />);
    const rows = screen.getAllByRole("link");

    expect(rows[0]).toHaveClass("bg-srs-familiar");
    expect(rows[1]).toHaveClass("border-primary/50");
    expect(rows[1]).toHaveClass("bg-primary/10");
    expect(rows[2]).toHaveClass("border-dashed");
    expect(rows[2]).toHaveClass("bg-muted/40");
  });
});
