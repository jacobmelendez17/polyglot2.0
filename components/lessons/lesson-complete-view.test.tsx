import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LessonCompleteView } from "@/components/lessons/lesson-complete-view";
import type { LessonCompletionPreview } from "@/domains/lessons";

const COMPLETION: LessonCompletionPreview = {
  items: [
    { id: "vocab-gato", label: "gato", meaning: "cat" },
    { id: "vocab-perro", label: "perro", meaning: "dog" },
  ],
  newStage: "Beginner 1",
  accuracy: 86,
};

describe("LessonCompleteView", () => {
  it("renders the newly learned item count, Beginner 1, and accuracy", () => {
    render(<LessonCompleteView completion={COMPLETION} />);

    expect(screen.getByText("Lesson Complete!")).toBeInTheDocument();
    expect(screen.getByText("2 new items learned")).toBeInTheDocument();
    expect(screen.getByText("Beginner 1")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
    expect(screen.getByText("gato")).toBeInTheDocument();
    expect(screen.getByText("perro")).toBeInTheDocument();
  });

  it("provides a primary return-to-dashboard action", () => {
    render(<LessonCompleteView completion={COMPLETION} />);
    expect(screen.getByRole("link", { name: "Return to Dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
