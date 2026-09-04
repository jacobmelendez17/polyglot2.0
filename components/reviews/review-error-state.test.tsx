import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReviewErrorState } from "@/components/reviews/review-error-state";

describe("ReviewErrorState", () => {
  it("states plainly that progress was not changed", () => {
    render(<ReviewErrorState error={{ code: "UNKNOWN", message: "Something went wrong." }} />);
    expect(screen.getByText(/Your SRS progress was not changed/)).toBeInTheDocument();
  });

  it("offers a retry for a recoverable error", () => {
    render(<ReviewErrorState error={{ code: "RATE_LIMITED", message: "Please slow down." }} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("offers a link back to reviews for a non-recoverable error, instead of a dead retry button", () => {
    render(<ReviewErrorState error={{ code: "INVALID_REVIEW_STATE", message: "Session invalid." }} />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to reviews/i })).toHaveAttribute("href", "/reviews");
  });
});
