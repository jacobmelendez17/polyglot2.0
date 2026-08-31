import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LessonsCard } from "@/components/dashboard/lessons-card";

describe("LessonsCard", () => {
  it("renders start and customize actions when lessons are available", () => {
    render(<LessonsCard lessons={{ availableCount: 6 }} />);

    expect(screen.getByRole("link", { name: "Start lessons" })).toHaveAttribute(
      "href",
      "/lessons"
    );
    expect(screen.getByRole("link", { name: "Customize" })).toHaveAttribute(
      "href",
      "/lessons/customize"
    );
  });

  it("renders an empty state when no lessons are available", () => {
    render(<LessonsCard lessons={{ availableCount: 0 }} />);

    expect(screen.getByText("No lessons available right now")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start lessons" })).not.toBeInTheDocument();
  });
});
