import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppHeader } from "@/components/shared/app-header";

vi.mock("@clerk/nextjs", () => {
  function UserButton({ children }: { children?: ReactNode }) {
    return <div data-testid="user-button">{children}</div>;
  }
  function MenuItems({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  }
  function MenuLink({ label, href }: { label: string; href: string }) {
    return <a href={href}>{label}</a>;
  }
  UserButton.MenuItems = MenuItems;
  UserButton.Link = MenuLink;
  return { UserButton };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("AppHeader", () => {
  it("renders the wordmark, primary nav links, the Levels control, and the account control", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "Polyglot" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Lessons" })).toHaveAttribute("href", "/lessons");
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute("href", "/reviews");
    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute("href", "/decks");
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: "Journey" })).toHaveAttribute("href", "/journey");
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });

  it("adds Settings to the account menu (spec 20 Routes) rather than a new top-level nav link", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("orders Lessons immediately to the left of Reviews", () => {
    render(<AppHeader />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const labels = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels.indexOf("Lessons")).toBe(labels.indexOf("Reviews") - 1);
  });

  it("the Levels control opens a dropdown rather than navigating directly (spec 10 §3/§34) — see levels-dropdown.test.tsx for full dropdown behavior coverage", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    const levelsControl = screen.getByRole("button", { name: "Levels" });
    expect(levelsControl).toBeInTheDocument();

    await user.click(levelsControl);
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute("href", "/levels/1");
  });
});
