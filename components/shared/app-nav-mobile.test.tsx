import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppNavMobile } from "@/components/shared/app-nav-mobile";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("AppNavMobile", () => {
  it("renders the primary tabs and marks the current route as active", () => {
    render(<AppNavMobile />);

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/dashboard");
    expect(home).toHaveAttribute("aria-current", "page");

    expect(screen.getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/levels");
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice");
  });

  it("reveals Decks and Journey under More", async () => {
    const user = userEvent.setup();
    render(<AppNavMobile />);

    await user.click(screen.getByRole("button", { name: "More" }));

    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/decks");
    expect(screen.getByRole("link", { name: "Journey" })).toHaveAttribute("href", "/journey");
  });
});
