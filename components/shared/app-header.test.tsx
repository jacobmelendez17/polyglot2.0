import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { AppHeader } from "@/components/shared/app-header";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}));

describe("AppHeader", () => {
  it("renders the wordmark linking to the dashboard, primary nav links, and the account control", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "Polyglot" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Levels" })).toHaveAttribute("href", "/levels");
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");
    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/decks");
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: "Journey" })).toHaveAttribute("href", "/journey");
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });
});
