import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Footer } from "@/components/shared/footer";

describe("Footer", () => {
  it("renders the brand, tagline, and only links to routes that exist", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "Polyglot" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Learn a little. Remember a lot.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Levels" })).toHaveAttribute("href", "/levels/1");
    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/decks");
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");

    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Feedback" })).toHaveAttribute("href", "/feedback");

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");

    // Practice, Journey, and Demo have no route yet — spec 21 forbids
    // linking to routes that don't resolve.
    expect(screen.queryByRole("link", { name: "Practice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Journey" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Demo" })).not.toBeInTheDocument();
  });

  it("labels each link group with a named nav landmark", () => {
    render(<Footer />);

    expect(screen.getByRole("navigation", { name: "Product" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Resources" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Legal" })).toBeInTheDocument();
  });

  it("shows the copyright year and Beta version", () => {
    render(<Footer />);

    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year} Polyglot · Beta 0.1`)).toBeInTheDocument();
  });

  it("renders as a semantic footer landmark", () => {
    render(<Footer />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
