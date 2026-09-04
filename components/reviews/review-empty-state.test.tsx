import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewEmptyState } from "@/components/reviews/review-empty-state";

describe("ReviewEmptyState", () => {
  it("presents zero due reviews as a success state, not an error", () => {
    render(<ReviewEmptyState nextReviewAt={null} />);
    expect(screen.getByText("No reviews due")).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("shows the next review time when available", () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    render(<ReviewEmptyState nextReviewAt={soon} />);
    expect(screen.getByText(/Next review:/)).toBeInTheDocument();
  });

  it("omits the next-review line when there is no upcoming review at all", () => {
    render(<ReviewEmptyState nextReviewAt={null} />);
    expect(screen.queryByText(/Next review:/)).not.toBeInTheDocument();
  });

  it("provides a route back to the dashboard", () => {
    render(<ReviewEmptyState nextReviewAt={null} />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
