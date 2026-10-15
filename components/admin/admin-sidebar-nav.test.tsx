import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { buildAdminPermissions } from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { AdminSidebarNav } from "./admin-sidebar-nav";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

const as = (role: UserRole) => buildAdminPermissions({ role });

describe("AdminSidebarNav", () => {
  it("shows an Admin every link, each to its own page", () => {
    mockPathname = "/admin";
    render(<AdminSidebarNav permissions={as("admin")} />);

    const expected: [string, string][] = [
      ["Overview", "/admin"],
      ["Curriculum", "/admin/curriculum"],
      ["Review", "/admin/curriculum/review"],
      ["Levels", "/admin/curriculum/levels"],
      ["Groups", "/admin/curriculum/groups"],
      ["Imports", "/admin/curriculum/imports"],
      ["Dictionary", "/admin/dictionary"],
      ["Decks", "/admin/decks"],
      ["Logs", "/admin/logs"],
      ["Sandbox", "/admin/sandbox"],
      ["Users", "/admin/users"],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("omits Curriculum/Levels/Groups for a developer-only user", () => {
    mockPathname = "/admin";
    render(<AdminSidebarNav permissions={as("developer")} />);

    for (const name of ["Curriculum", "Levels", "Groups", "Dictionary"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Logs" })).toBeInTheDocument();
  });

  it("offers a writer no link to a page that would refuse them — not Decks, Users, Logs or the Sandbox", () => {
    mockPathname = "/admin";
    render(<AdminSidebarNav permissions={as("writer")} />);

    for (const name of ["Decks", "Users", "Logs", "Sandbox"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    for (const name of ["Curriculum", "Review", "Dictionary", "Imports"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("is one labelled navigation landmark, in a fixed reading order", () => {
    mockPathname = "/admin";
    render(<AdminSidebarNav permissions={as("admin")} />);

    const nav = screen.getByRole("navigation", { name: "Admin" });
    expect(
      Array.from(nav.querySelectorAll("a")).map((link) => link.textContent),
    ).toEqual([
      "Overview",
      "Curriculum",
      "Review",
      "Levels",
      "Groups",
      "Imports",
      "Dictionary",
      "Decks",
      "Logs",
      "Sandbox",
      "Users",
    ]);
  });

  it("marks only the current route as aria-current", () => {
    mockPathname = "/admin/sandbox";
    render(<AdminSidebarNav permissions={as("admin")} />);

    expect(screen.getByRole("link", { name: "Sandbox" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks Levels, not Curriculum, as current on a Levels sub-route (sibling-prefix disambiguation)", () => {
    mockPathname = "/admin/curriculum/levels/abc-123";
    render(<AdminSidebarNav permissions={as("admin")} />);

    expect(screen.getByRole("link", { name: "Levels" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Curriculum" }),
    ).not.toHaveAttribute("aria-current");
  });

  it.each([
    ["Dictionary", "/admin/dictionary"],
    ["Decks", "/admin/decks/00000000-0000-4000-8000-000000000001"],
    ["Users", "/admin/users"],
  ])("marks %s current on its page", (name, path) => {
    mockPathname = path;
    render(<AdminSidebarNav permissions={as("admin")} />);
    expect(screen.getByRole("link", { name })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
