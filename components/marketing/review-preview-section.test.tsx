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

  it("rotates the carousel every 5 seconds", () => {
    render(<ReviewPreviewSection />);

    // Initial: Maria in the middle, Daniel to her right, Priya on the left.
    expect(slotOf("Maria S.")).toBe("center");
    expect(slotOf("Daniel K.")).toBe("right");
    expect(slotOf("Priya N.")).toBe("left");
    expect(
      screen.getAllByRole("img", { name: "Spain flag", hidden: true }),
    ).toHaveLength(3);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // The right card moves to the middle, the middle moves left, and the
    // left card goes behind the others.
    expect(slotOf("Daniel K.")).toBe("center");
    expect(slotOf("Maria S.")).toBe("left");
    expect(slotOf("Priya N.")).toBe("back");
  });
});
