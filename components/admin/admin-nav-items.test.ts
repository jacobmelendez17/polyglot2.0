import { describe, expect, it } from "vitest";

import { buildAdminPermissions } from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import { getAdminNavItems, isAdminNavItemCurrent } from "./admin-nav-items";

/**
 * The navigation is a function of the *server's* effective permissions
 * (`buildAdminPermissions` — what `GET /api/v1/admin/me` serves to every React
 * Admin screen), so these tests build them from a role, the way the layout
 * does, instead of passing flags: a role whose permissions change changes its
 * menu here too.
 */
const navFor = (role: UserRole) =>
  getAdminNavItems(buildAdminPermissions({ role }));
const labelsFor = (role: UserRole) => navFor(role).map((item) => item.label);

describe("getAdminNavItems — one menu per role", () => {
  it("shows an Admin everything: the curriculum sections, the tools, and Users last", () => {
    expect(labelsFor("admin")).toEqual([
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

  it("shows a writer what they author with — and not Decks, Logs, the Sandbox or Users (spec 17, spec 26 §6)", () => {
    // Decks are an Admin's end to end: a writer's menu does not offer a page
    // that would refuse them.
    expect(labelsFor("writer")).toEqual([
      "Overview",
      "Curriculum",
      "Review",
      "Levels",
      "Groups",
      "Imports",
      "Dictionary",
    ]);
  });

  it("shows a developer Overview and the two operational tools, and no curriculum section (spec 11 §4)", () => {
    expect(labelsFor("developer")).toEqual(["Overview", "Logs", "Sandbox"]);
  });

  it.each(["user", "beta-tester"] as const)(
    "offers a %s nothing — they are not in the Admin area at all",
    (role) => {
      expect(labelsFor(role)).toEqual([]);
    },
  );
});

describe("getAdminNavItems — the menu and the screens agree", () => {
  it("has a link for every resource the server lists for an Admin, plus the two retained tools", () => {
    const resources = Object.keys(
      buildAdminPermissions({ role: "admin" }).resources,
    );
    // A resource added to the effective permissions without a link (or a link
    // added without a resource) is a decision someone has to make on purpose.
    expect(navFor("admin")).toHaveLength(resources.length + 2);
  });

  it.each(["admin", "writer", "developer"] as const)(
    "offers a %s only links to resources the server lists for them, or to tools they may use",
    (role) => {
      const permissions = buildAdminPermissions({ role });
      const tools = new Set(["Logs", "Sandbox"]);
      for (const item of navFor(role)) {
        if (tools.has(item.label)) {
          expect(permissions.canUseDeveloperTools).toBe(true);
        } else {
          expect(Object.keys(permissions.resources).length).toBeGreaterThan(0);
        }
      }
    },
  );

  it("follows the permissions it is given, not a role name — a resource the server stops listing disappears", () => {
    const withDecks = buildAdminPermissions({ role: "admin" });
    const { decks, ...withoutDecks } = withDecks.resources;
    expect(decks).toBeDefined();

    const labels = getAdminNavItems({
      ...withDecks,
      resources: withoutDecks,
    }).map((item) => item.label);

    expect(labels).not.toContain("Decks");
    expect(labels).toContain("Dictionary");
  });
});

describe("getAdminNavItems — Users (spec 26 Unit 6)", () => {
  it("links Users to its page", () => {
    expect(navFor("admin").find((item) => item.label === "Users")?.href).toBe(
      "/admin/users",
    );
  });

  it.each(["writer", "developer"] as const)(
    "does not offer Users to a %s",
    (role) => {
      expect(labelsFor(role)).not.toContain("Users");
    },
  );

  it("marks Users current on its page, and Overview not", () => {
    const items = navFor("admin");
    const users = items.find((item) => item.label === "Users")!;
    const overview = items.find((item) => item.label === "Overview")!;
    expect(isAdminNavItemCurrent(users, "/admin/users", items)).toBe(true);
    expect(isAdminNavItemCurrent(overview, "/admin/users", items)).toBe(false);
  });
});

describe("isAdminNavItemCurrent", () => {
  it("matches Overview only on the exact /admin path, not every /admin-prefixed route", () => {
    const overview = { label: "Overview", href: "/admin" };
    expect(isAdminNavItemCurrent(overview, "/admin")).toBe(true);
    expect(isAdminNavItemCurrent(overview, "/admin/sandbox")).toBe(false);
  });

  it("matches other items by prefix, including nested routes", () => {
    const sandbox = { label: "Sandbox", href: "/admin/sandbox" };
    expect(isAdminNavItemCurrent(sandbox, "/admin/sandbox")).toBe(true);
    expect(isAdminNavItemCurrent(sandbox, "/admin")).toBe(false);
  });

  it("prefers the more specific sibling when routes nest (Levels/Groups under Curriculum's own prefix)", () => {
    const items = navFor("admin");
    const curriculum = items.find((i) => i.label === "Curriculum")!;
    const levels = items.find((i) => i.label === "Levels")!;

    expect(
      isAdminNavItemCurrent(levels, "/admin/curriculum/levels/abc-123", items),
    ).toBe(true);
    expect(
      isAdminNavItemCurrent(
        curriculum,
        "/admin/curriculum/levels/abc-123",
        items,
      ),
    ).toBe(false);
    // A genuine Curriculum sub-route with no sibling of its own still matches Curriculum.
    expect(
      isAdminNavItemCurrent(curriculum, "/admin/curriculum/items/new", items),
    ).toBe(true);
  });

  it("highlights Imports, not Curriculum, on an import's own page", () => {
    const items = navFor("admin");
    const imports = items.find((i) => i.label === "Imports")!;
    const curriculum = items.find((i) => i.label === "Curriculum")!;
    const path =
      "/admin/curriculum/imports/60000000-0000-4000-8000-000000000001";
    expect(isAdminNavItemCurrent(imports, path, items)).toBe(true);
    expect(isAdminNavItemCurrent(curriculum, path, items)).toBe(false);
  });
});
