import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelEmptyState } from "@/components/levels/level-empty-state";

describe("LevelEmptyState", () => {
  it("shows the given message, never fabricated curriculum content", () => {
    render(<LevelEmptyState message="No grammar items have been published for this level yet." />);
    expect(screen.getByText("No grammar items have been published for this level yet.")).toBeInTheDocument();
  });
});
