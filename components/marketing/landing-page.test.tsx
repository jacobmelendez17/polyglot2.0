import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import LandingPage from "@/app/(marketing)/page";

vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) =>
    when === "signed-out" ? children : null,
}));

describe("LandingPage", () => {
  it("renders exactly one h1 and no headings deeper than h2", () => {
    render(<LandingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });
});
