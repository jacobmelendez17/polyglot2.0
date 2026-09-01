import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonProgressSegments, type ProgressSegmentItem } from "@/components/lessons/lesson-progress-segments";

const ITEMS: ProgressSegmentItem[] = [
  { itemId: "a", itemType: "vocabulary", state: "complete", stateLabel: "viewed" },
  { itemId: "b", itemType: "grammar", state: "current", stateLabel: "current" },
  { itemId: "c", itemType: "vocabulary", state: "not-started", stateLabel: "not viewed" },
  { itemId: "d", itemType: "vocabulary", state: "partial", stateLabel: "partially satisfied" },
];

describe("LessonProgressSegments", () => {
  it("renders one segment per lesson item with accessible labels", () => {
    render(<LessonProgressSegments items={ITEMS} />);

    expect(screen.getByLabelText("Vocabulary item 1 of 4, viewed")).toBeInTheDocument();
    expect(screen.getByLabelText("Grammar item 2 of 4, current")).toBeInTheDocument();
    expect(screen.getByLabelText("Vocabulary item 3 of 4, not viewed")).toBeInTheDocument();
    expect(screen.getByLabelText("Vocabulary item 4 of 4, partially satisfied")).toBeInTheDocument();
  });

  it("marks the current segment with aria-current", () => {
    render(<LessonProgressSegments items={ITEMS} onSelect={() => {}} />);
    expect(screen.getByLabelText("Grammar item 2 of 4, current")).toHaveAttribute("aria-current", "true");
  });

  it("acts as an item selector during study when onSelect is provided", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<LessonProgressSegments items={ITEMS} onSelect={onSelect} />);

    await user.click(screen.getByLabelText("Vocabulary item 3 of 4, not viewed"));
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("is not interactive during the quiz (no onSelect)", () => {
    render(<LessonProgressSegments items={ITEMS} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
