import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { ReviewPreviewSection } from "@/components/marketing/review-preview-section";

function slotOf(name: string): string | null {
  return screen
    .getByText(name)
    .closest("article")
    ?.getAttribute("data-slot") as string | null;
}

describe("ReviewPreviewSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the User reviews title and star ratings", () => {
    render(<ReviewPreviewSection />);

    expect(
      screen.getByRole("heading", { name: "User reviews" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("img", { name: /out of 5 stars/, hidden: true }),
    ).toHaveLength(5);
  });

  it("rotates the carousel clockwise every 5 seconds", () => {
    render(<ReviewPreviewSection />);

    // Initial: Maria in the middle, Daniel to her right, Priya on the left.
    expect(slotOf("Maria S.")).toBe("center");
    expect(slotOf("Daniel K.")).toBe("right");
    expect(slotOf("Priya N.")).toBe("left");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // The left card moves to the middle; the middle moves right; the right
    // card goes round the back.
    expect(slotOf("Priya N.")).toBe("center");
    expect(slotOf("Maria S.")).toBe("right");
    expect(slotOf("Daniel K.")).toBe("back");
  });
});
