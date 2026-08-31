import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewsCard } from "@/components/dashboard/reviews-card";

describe("ReviewsCard", () => {
  it("renders a start-reviews action and count when reviews are available", () => {
    render(<ReviewsCard reviews={{ availableCount: 14, nextReviewAt: null }} />);

    expect(screen.getByText("14 ready for review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start reviews" })).toHaveAttribute(
      "href",
      "/reviews"
    );
  });

  it("renders the next review time when none are available yet", () => {
    render(
      <ReviewsCard
        reviews={{ availableCount: 0, nextReviewAt: "2026-08-30T15:00:00.000Z" }}
      />
    );

    expect(screen.getByText(/Next review/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start reviews" })).not.toBeInTheDocument();
  });

  it("renders a new-user empty state when nothing has ever been scheduled", () => {
    render(<ReviewsCard reviews={{ availableCount: 0, nextReviewAt: null }} />);

    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start lessons" })).toHaveAttribute(
      "href",
      "/lessons"
    );
  });
});
