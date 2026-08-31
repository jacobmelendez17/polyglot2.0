import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { HeroSection } from "@/components/marketing/hero-section";

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: { signedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) =>
    (when === "signed-in") === mockAuthState.signedIn ? children : null,
}));

describe("HeroSection", () => {
  beforeEach(() => {
    mockAuthState.signedIn = false;
  });

  it("links the primary and secondary calls to action to /sign-up and /demo when signed out", () => {
    render(<HeroSection />);

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
  });

  it("shows a single 'Go to dashboard' link instead when signed in", () => {
    mockAuthState.signedIn = true;
    render(<HeroSection />);

    expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.queryByRole("link", { name: "Sign up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Try the demo" })).not.toBeInTheDocument();
  });

  it("reads semantically as 'Fluency begins ここ'", () => {
    render(<HeroSection />);

    expect(screen.getByRole("heading", { name: /Fluency begins ここ/ })).toBeInTheDocument();
  });
});
