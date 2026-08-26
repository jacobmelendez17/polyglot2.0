import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PracticeSection } from "@/components/marketing/practice-section";

describe("PracticeSection", () => {
  it("renders six practice mode cards", () => {
    render(<PracticeSection />);

    expect(screen.getAllByTestId("practice-card")).toHaveLength(6);
  });
});
