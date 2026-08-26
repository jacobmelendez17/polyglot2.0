import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import LandingPage from "@/app/(marketing)/page";

describe("LandingPage", () => {
  it("renders exactly one h1 and no headings deeper than h2", () => {
    render(<LandingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });
});
