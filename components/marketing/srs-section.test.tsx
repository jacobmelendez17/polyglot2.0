import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SrsSection } from "@/components/marketing/srs-section";

const EXPECTED_STAGE_ORDER = [
  "Beginner 1",
  "Beginner 2",
  "Beginner 3",
  "Beginner 4",
  "Familiar 1",
  "Familiar 2",
  "Intermediate",
  "Master",
  "Fluent",
];

describe("SrsSection", () => {
  it("renders all nine SRS stages as cards in documented order", () => {
    render(<SrsSection />);

    const names = screen.getAllByTestId("srs-stage-name").map((el) => el.textContent);
    expect(names).toEqual(EXPECTED_STAGE_ORDER);
  });
});
