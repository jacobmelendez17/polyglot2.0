import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelSelector } from "@/components/levels/level-selector";

describe("LevelSelector", () => {
  it("renders exactly Levels 1-50 as links", () => {
    render(<LevelSelector currentLevel={8} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(50);
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute("href", "/levels/1");
    expect(screen.getByRole("link", { name: "50" })).toHaveAttribute("href", "/levels/50");
  });

  it("indicates the current level without relying on color alone", () => {
    render(<LevelSelector currentLevel={5} />);

    const current = screen.getByRole("link", { name: "5" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toMatch(/border/);

    const other = screen.getByRole("link", { name: "4" });
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("navigating to another level is a real link to that level's route", () => {
    render(<LevelSelector currentLevel={5} />);
    expect(screen.getByRole("link", { name: "12" })).toHaveAttribute("href", "/levels/12");
  });
});
