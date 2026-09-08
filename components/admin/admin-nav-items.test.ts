import { describe, expect, it } from "vitest";

import { getAdminNavItems, isAdminNavItemCurrent } from "./admin-nav-items";

describe("getAdminNavItems", () => {
  it("includes the curriculum-management sections when the user can manage curriculum", () => {
    const labels = getAdminNavItems(true).map((item) => item.label);
    expect(labels).toEqual(["Overview", "Curriculum", "Levels", "Groups", "Dictionary", "Decks", "Logs", "Sandbox"]);
  });

  it("omits every curriculum-management section for a developer-only user (spec 11 §4)", () => {
    const labels = getAdminNavItems(false).map((item) => item.label);
    expect(labels).toEqual(["Overview", "Logs", "Sandbox"]);
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

    expect(isAdminNavItemCurrent(levels, "/admin/curriculum/levels/abc-123", items)).toBe(true);
    expect(isAdminNavItemCurrent(curriculum, "/admin/curriculum/levels/abc-123", items)).toBe(false);
    // A genuine Curriculum sub-route with no sibling of its own still matches Curriculum.
    expect(isAdminNavItemCurrent(curriculum, "/admin/curriculum/items/new", items)).toBe(true);
  });
});
