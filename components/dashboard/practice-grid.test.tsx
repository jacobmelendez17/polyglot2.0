import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { PracticeGrid } from "@/components/dashboard/practice-grid";

describe("PracticeGrid", () => {
  it("renders all four practice areas linking to their expected routes", () => {
    render(<PracticeGrid />);

    expect(screen.getByRole("link", { name: "Speaking" })).toHaveAttribute(
      "href",
      "/practice/speaking"
    );
    expect(screen.getByRole("link", { name: "Listening" })).toHaveAttribute(
      "href",
      "/practice/listening"
    );
    expect(screen.getByRole("link", { name: "Reading" })).toHaveAttribute(
      "href",
      "/practice/reading"
    );
    expect(screen.getByRole("link", { name: "Writing" })).toHaveAttribute(
      "href",
      "/practice/writing"
    );
  });
});
