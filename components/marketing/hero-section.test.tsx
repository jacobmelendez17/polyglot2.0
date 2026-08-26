import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { HeroSection } from "@/components/marketing/hero-section";

describe("HeroSection", () => {
  it("links the primary and secondary calls to action to /sign-up and /demo", () => {
    render(<HeroSection />);

    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: "Try the demo" })).toHaveAttribute("href", "/demo");
  });
});
