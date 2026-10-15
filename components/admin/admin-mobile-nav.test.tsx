import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildAdminPermissions } from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { AdminMobileNav } from "./admin-mobile-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

const as = (role: UserRole) => buildAdminPermissions({ role });

async function open(role: UserRole) {
  const user = userEvent.setup();
  render(<AdminMobileNav permissions={as(role)} />);
  await user.click(
    screen.getByRole("button", { name: "Open Admin navigation" }),
  );
}

describe("AdminMobileNav", () => {
  it("opens a sheet with every permitted nav item on trigger click", async () => {
    const user = userEvent.setup();
    render(<AdminMobileNav permissions={as("developer")} />);

    const trigger = screen.getByRole("button", {
      name: "Open Admin navigation",
    });
    expect(trigger).toBeInTheDocument();
    // Sheet content isn't mounted until opened — regression guard for the
    // real bug this component's split fixed: the trigger must exist
    // outside any parent that's `hidden` at this viewport, and its content
    // must only ever be reachable through this trigger, not always-present.
    expect(
      screen.queryByRole("link", { name: "Sandbox" }),
    ).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole("link", { name: "Sandbox" })).toHaveAttribute(
      "href",
      "/admin/sandbox",
    );
    expect(
      screen.queryByRole("link", { name: "Curriculum" }),
    ).not.toBeInTheDocument();
  });

  it("gives an Admin the same links as the sidebar, each to its own page", async () => {
    await open("admin");

    const expected: [string, string][] = [
      ["Curriculum", "/admin/curriculum"],
      ["Levels", "/admin/curriculum/levels"],
      ["Groups", "/admin/curriculum/groups"],
      ["Imports", "/admin/curriculum/imports"],
      ["Dictionary", "/admin/dictionary"],
      ["Decks", "/admin/decks"],
      ["Users", "/admin/users"],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("offers a writer no link to a page that would refuse them — not Decks, Users, Logs or the Sandbox", async () => {
    await open("writer");

    for (const name of ["Decks", "Users", "Logs", "Sandbox"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Dictionary" })).toHaveAttribute(
      "href",
      "/admin/dictionary",
    );
  });
});
