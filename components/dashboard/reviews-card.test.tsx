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

  it("renders a non-clickable 'No reviews due yet' card with the next review time when caught up", () => {
    render(
      <ReviewsCard
        reviews={{ availableCount: 0, nextReviewAt: "2026-08-30T15:00:00.000Z" }}
      />
    );

    expect(screen.getByText("No reviews due yet")).toBeInTheDocument();
    expect(screen.getByText(/Next review/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the same non-clickable 'No reviews due yet' card when nothing has ever been scheduled", () => {
    render(<ReviewsCard reviews={{ availableCount: 0, nextReviewAt: null }} />);

    expect(screen.getByText("No reviews due yet")).toBeInTheDocument();
    expect(screen.getByText("Complete a lesson to start your first reviews.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
