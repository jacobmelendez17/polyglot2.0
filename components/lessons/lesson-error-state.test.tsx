import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LessonErrorState } from "@/components/lessons/lesson-error-state";

describe("LessonErrorState", () => {
  it("states clearly that no progress was saved", () => {
    render(<LessonErrorState error={{ code: "LESSON_STATE_INVALID", message: "Your lesson session is no longer valid." }} />);
    expect(screen.getByText(/no progress was saved/i)).toBeInTheDocument();
    expect(screen.getByText("Your lesson session is no longer valid.")).toBeInTheDocument();
  });

  it("offers a route back to the dashboard", () => {
    render(<LessonErrorState error={{ code: "LESSON_STATE_INVALID", message: "Invalid." }} />);
    expect(screen.getByRole("link", { name: "Return to Dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("offers a retry action for a recoverable error", () => {
    render(<LessonErrorState error={{ code: "RATE_LIMITED", message: "Please slow down." }} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
