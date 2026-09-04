import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LevelsDropdown } from "@/components/shared/levels-dropdown";

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("LevelsDropdown", () => {
  it("does not render the level links until opened", () => {
    render(<LevelsDropdown />);
    expect(screen.queryByRole("link", { name: "1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Levels" })).toBeInTheDocument();
  });

  it("opens on click and renders exactly Levels 1-50", async () => {
    const user = userEvent.setup();
    render(<LevelsDropdown />);

    await user.click(screen.getByRole("button", { name: "Levels" }));

    const levelLinks = screen.getAllByRole("link").filter((el) => /^\/levels\/\d+$/.test(el.getAttribute("href") ?? ""));
    expect(levelLinks).toHaveLength(50);
    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute("href", "/levels/1");
    expect(screen.getByRole("link", { name: "50" })).toHaveAttribute("href", "/levels/50");
  });

  it("Level 12 points to /levels/12", async () => {
    const user = userEvent.setup();
    render(<LevelsDropdown />);
    await user.click(screen.getByRole("button", { name: "Levels" }));
    expect(screen.getByRole("link", { name: "12" })).toHaveAttribute("href", "/levels/12");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<LevelsDropdown />);
    await user.click(screen.getByRole("button", { name: "Levels" }));
    expect(screen.getByRole("link", { name: "1" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: "1" })).not.toBeInTheDocument();
  });

  it("closes when a level is selected", async () => {
    const user = userEvent.setup();
    render(<LevelsDropdown />);
    await user.click(screen.getByRole("button", { name: "Levels" }));

    await user.click(screen.getByRole("link", { name: "7" }));
    expect(screen.queryByRole("link", { name: "1" })).not.toBeInTheDocument();
  });

  it("indicates the current level without relying on color alone (aria-current plus a border/weight treatment)", async () => {
    mockPathname = "/levels/5";
    const user = userEvent.setup();
    render(<LevelsDropdown />);
    await user.click(screen.getByRole("button", { name: "Levels" }));

    const current = screen.getByRole("link", { name: "5" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.className).toMatch(/border/);
    expect(current.className).toMatch(/font-semibold/);

    const other = screen.getByRole("link", { name: "6" });
    expect(other).not.toHaveAttribute("aria-current");
    mockPathname = "/dashboard";
  });
});
