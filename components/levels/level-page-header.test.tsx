import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelPageHeader } from "@/components/levels/level-page-header";

describe("LevelPageHeader", () => {
  it("identifies the current level", () => {
    render(<LevelPageHeader levelNumber={8} />);
    expect(screen.getByRole("heading", { name: "Level 8" })).toBeInTheDocument();
  });
});
