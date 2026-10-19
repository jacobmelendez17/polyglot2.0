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

  it("offers a writer no link to a page that would refuse them — not Imports, Users, Logs or the Sandbox — and does offer the decks they may see", async () => {
    await open("writer");

    for (const name of ["Imports", "Users", "Logs", "Sandbox"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Dictionary" })).toHaveAttribute(
      "href",
      "/admin/dictionary",
    );
    expect(screen.getByRole("link", { name: "Decks" })).toHaveAttribute(
      "href",
      "/admin/decks",
    );
  });
});

describe("AdminMobileNav — links out of Polyglot (spec 27 Unit 27.10)", () => {
  const ANALYTICS = [
    {
      label: "Analytics",
      href: "https://us.posthog.com/project/12345/dashboard",
    },
  ];

  async function openWith(
    role: UserRole,
    externalLinks?: { label: string; href: string }[],
  ) {
    const user = userEvent.setup();
    render(
      <AdminMobileNav permissions={as(role)} externalLinks={externalLinks} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Open Admin navigation" }),
    );
  }

  it("offers none unless it is given one", async () => {
    await openWith("admin");

    expect(
      screen.queryByRole("link", { name: /Analytics/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the Analytics link in the menu, opening a new tab that is cut off from this one", async () => {
    await openWith("developer", ANALYTICS);

    const analytics = screen.getByRole("link", {
      name: "Analytics (opens in a new tab)",
    });
    expect(analytics).toHaveAttribute(
      "href",
      "https://us.posthog.com/project/12345/dashboard",
    );
    expect(analytics).toHaveAttribute("target", "_blank");
    expect(analytics.getAttribute("rel")).toContain("noopener");
    expect(analytics.getAttribute("rel")).toContain("noreferrer");
  });

  it("keeps the page links as they were", async () => {
    await openWith("developer", ANALYTICS);

    expect(screen.getByRole("link", { name: "Logs" })).toHaveAttribute(
      "href",
      "/admin/logs",
    );
    expect(screen.getByRole("link", { name: "Sandbox" })).toHaveAttribute(
      "href",
      "/admin/sandbox",
    );
  });
});
