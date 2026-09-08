import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SrsStageBadge } from "@/components/shared/srs-stage-badge";

describe("SrsStageBadge", () => {
  it("always renders a text label, so stage is never carried by color alone", () => {
    render(<SrsStageBadge stage="beginner_3" />);
    expect(screen.getByText("Beginner 3")).toBeInTheDocument();
  });

  it("shares one color across a stage's sub-stages while the number stays in the text", () => {
    const { container: first } = render(<SrsStageBadge stage="beginner_1" />);
    const { container: second } = render(<SrsStageBadge stage="beginner_4" />);
    expect(first.firstElementChild?.className).toBe(second.firstElementChild?.className);
    expect(screen.getByText("Beginner 1")).toBeInTheDocument();
    expect(screen.getByText("Beginner 4")).toBeInTheDocument();
  });

  it("reads a missing progress record as 'Not started' — a real state, not an error", () => {
    render(<SrsStageBadge stage={null} />);
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });
});
