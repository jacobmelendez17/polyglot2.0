import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LessonEmptyState } from "@/components/lessons/lesson-empty-state";

describe("LessonEmptyState", () => {
  it("explains why there is no lesson and offers a route back to the dashboard", () => {
    render(<LessonEmptyState />);
    expect(screen.getByText("No lessons available right now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to Dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
