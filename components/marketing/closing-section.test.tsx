import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ClosingSection } from "@/components/marketing/closing-section";

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: { signedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) =>
    (when === "signed-in") === mockAuthState.signedIn ? children : null,
}));

describe("ClosingSection", () => {
  beforeEach(() => {
    mockAuthState.signedIn = false;
  });

  it("invites sign-up when signed out", () => {
    render(<ClosingSection />);

    expect(screen.getByText(/Create a free account/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();
  });

  it("points to the dashboard when signed in", () => {
    mockAuthState.signedIn = true;
    render(<ClosingSection />);

    expect(screen.getByText(/Continue your curriculum/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.queryByText(/Create a free account/)).not.toBeInTheDocument();
  });
});
