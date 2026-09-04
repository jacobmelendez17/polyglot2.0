import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewCompletionView } from "@/components/reviews/review-completion-view";

describe("ReviewCompletionView", () => {
  it("shows reviews completed and session accuracy", () => {
    render(
      <ReviewCompletionView
        stats={{ itemsTotal: 5, itemsCompleted: 5, questionsAttempted: 11, questionsCorrect: 9 }}
      />,
    );

    expect(screen.getByText(/5 reviews completed/)).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("omits accuracy when nothing was attempted", () => {
    render(
      <ReviewCompletionView stats={{ itemsTotal: 0, itemsCompleted: 0, questionsAttempted: 0, questionsCorrect: 0 }} />,
    );
    expect(screen.queryByText(/Session accuracy/)).not.toBeInTheDocument();
  });

  it("provides a route back to the dashboard", () => {
    render(
      <ReviewCompletionView stats={{ itemsTotal: 1, itemsCompleted: 1, questionsAttempted: 2, questionsCorrect: 2 }} />,
    );
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
  });
});
