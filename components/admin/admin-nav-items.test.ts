import { describe, expect, it } from "vitest";

import { getAdminNavItems, isAdminNavItemCurrent } from "./admin-nav-items";

describe("getAdminNavItems", () => {
  it("includes the curriculum-management sections when the user can manage curriculum", () => {
    const labels = getAdminNavItems(true).map((item) => item.label);
    expect(labels).toEqual([
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
    ]);
  });

  it("omits every curriculum-management section for a developer-only user (spec 11 §4)", () => {
    const labels = getAdminNavItems(false).map((item) => item.label);
    expect(labels).toEqual(["Overview", "Logs", "Sandbox"]);
  });

  it("hides Logs and the Sandbox from a writer, who authors curriculum and nothing else (spec 17)", () => {
    const labels = getAdminNavItems(true, false).map((item) => item.label);
    expect(labels).toEqual([
      "Overview",
      "Curriculum",
      "Review",
      "Levels",
      "Groups",
      "Imports",
      "Dictionary",
      "Decks",
    ]);
    expect(labels).not.toContain("Sandbox");
  });
});

describe("getAdminNavItems — Users (spec 26 Unit 6)", () => {
  it("adds Users, last, for an Admin — who has every other section too", () => {
    const labels = getAdminNavItems(true, true, true).map((item) => item.label);
    expect(labels.at(-1)).toBe("Users");
    expect(labels).toContain("Curriculum");
    expect(labels).toContain("Sandbox");
  });

  it("links Users to its page", () => {
    expect(
      getAdminNavItems(true, true, true).find((item) => item.label === "Users")
        ?.href,
    ).toBe("/admin/users");
  });

  it.each([
    ["a writer", true, false, false],
    ["a developer without the admin role", false, true, false],
    // Not asked for: the default is no.
    ["anyone, when nothing says otherwise", true, true, undefined],
  ] as const)(
    "does not offer Users to %s",
    (_who, curriculum, tools, accounts) => {
      const labels = getAdminNavItems(curriculum, tools, accounts).map(
        (item) => item.label,
      );
      expect(labels).not.toContain("Users");
    },
  );

  it("marks Users current on its page, and Overview not", () => {
    const items = getAdminNavItems(true, true, true);
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
    const items = getAdminNavItems(true);
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
});
