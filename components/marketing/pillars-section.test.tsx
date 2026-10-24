import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PillarsSection } from "@/components/marketing/pillars-section";

describe("PillarsSection", () => {
  it("renders a card for each of the six things you study", () => {
    render(<PillarsSection />);

    expect(screen.getAllByTestId("pillar-card")).toHaveLength(6);
    for (const title of [
      "Vocabulary",
      "Grammar",
      "Speaking",
      "Reading",
      "Testing",
      "Listening",
    ]) {
      // Front and back each name the card; both stay in the DOM for assistive tech.
      expect(screen.getAllByText(title)).toHaveLength(2);
    }
  });

  it("keeps the description on the back of each card", () => {
    render(<PillarsSection />);

    expect(screen.getByText(/48 vocabulary items/)).toBeInTheDocument();
    expect(screen.getByText(/12 grammar points/)).toBeInTheDocument();
  });
});
