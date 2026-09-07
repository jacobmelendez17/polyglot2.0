import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ItemProgressPanel } from "@/components/items/item-progress-panel";
import type { ItemProgress } from "@/domains/progress";

function buildProgress(overrides: Partial<ItemProgress> = {}): ItemProgress {
  return {
    userId: "user-1",
    learningItemId: "item-1",
    languageId: "language-1",
    srsStage: "beginner_2",
    learnedAt: new Date("2026-01-01T00:00:00.000Z"),
    nextReviewAt: new Date("2026-01-02T00:00:00.000Z"),
    fluentAt: null,
    correctCount: 3,
    incorrectCount: 1,
    reviewCount: 4,
    lastReviewedAt: new Date("2026-01-01T12:00:00.000Z"),
    version: 1,
    ...overrides,
  };
}

describe("ItemProgressPanel", () => {
  it("shows a not-yet-studied message when the learner has no progress row", () => {
    render(<ItemProgressPanel progress={null} />);

    expect(screen.getByText(/Not yet studied/)).toBeInTheDocument();
  });

  it("shows the stage label, review count, and accuracy for an enrolled item", () => {
    render(<ItemProgressPanel progress={buildProgress()} />);

    expect(screen.getByText("Beginner 2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("omits accuracy before any review has happened", () => {
    render(<ItemProgressPanel progress={buildProgress({ correctCount: 0, incorrectCount: 0, reviewCount: 0, nextReviewAt: null })} />);

    expect(screen.queryByText("Accuracy")).not.toBeInTheDocument();
  });

  it("shows 'Mastered' rather than a relative time once an item has reached Fluent", () => {
    render(<ItemProgressPanel progress={buildProgress({ srsStage: "fluent", nextReviewAt: null, fluentAt: new Date("2026-01-05T00:00:00.000Z") })} />);

    expect(screen.getByText("Mastered")).toBeInTheDocument();
  });
});
