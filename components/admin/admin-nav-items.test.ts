import { describe, expect, it } from "vitest";

import { getAdminNavItems, isAdminNavItemCurrent } from "./admin-nav-items";

describe("getAdminNavItems", () => {
  it("includes Curriculum when the user can manage curriculum", () => {
    const labels = getAdminNavItems(true).map((item) => item.label);
    expect(labels).toEqual(["Overview", "Curriculum", "Logs", "Sandbox"]);
  });

  it("omits Curriculum for a developer-only user (spec 11 §4)", () => {
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
});
