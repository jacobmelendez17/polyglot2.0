import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { LandingCta } from "@/components/marketing/landing-cta";

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: { signedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) =>
    (when === "signed-in") === mockAuthState.signedIn ? children : null,
}));

describe("LandingCta", () => {
  beforeEach(() => {
    mockAuthState.signedIn = false;
  });

  it("renders Sign up and Try the demo when signed out", () => {
    render(<LandingCta />);

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
    expect(screen.queryByRole("link", { name: "Go to dashboard" })).not.toBeInTheDocument();
  });

  it("renders only a single Go to dashboard link when signed in", () => {
    mockAuthState.signedIn = true;
    render(<LandingCta />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard");
    expect(links[0]).toHaveTextContent("Go to dashboard");
  });
});
