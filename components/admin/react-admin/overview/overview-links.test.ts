import { describe, expect, it } from "vitest";

import { getOverviewLinks } from "./overview-links";

const labels = (
  permissions: Parameters<typeof getOverviewLinks>[0],
): string[] => getOverviewLinks(permissions).map((link) => link.label);

describe("getOverviewLinks", () => {
  it("gives an admin every shortcut", () => {
    expect(
      labels({ canManageCurriculum: true, canUseDeveloperTools: true }),
    ).toEqual(["Curriculum", "Logs", "Sandbox"]);
  });

  it("gives a developer the operational tools only", () => {
    expect(
      labels({ canManageCurriculum: false, canUseDeveloperTools: true }),
    ).toEqual(["Logs", "Sandbox"]);
  });

  // The permission matrix (spec 26 §6): a writer authors curriculum and has
  // no business with Logs or the Sandbox. The previous Overview linked both.
  it("gives a writer curriculum only — no Logs or Sandbox", () => {
    expect(
      labels({ canManageCurriculum: true, canUseDeveloperTools: false }),
    ).toEqual(["Curriculum"]);
  });

  it("gives nobody a shortcut when the server grants nothing", () => {
    expect(
      labels({ canManageCurriculum: false, canUseDeveloperTools: false }),
    ).toEqual([]);
  });

  it("links to the existing Next routes, unchanged", () => {
    const links = getOverviewLinks({
      canManageCurriculum: true,
      canUseDeveloperTools: true,
    });
    expect(links.map((link) => link.href)).toEqual([
      "/admin/curriculum",
      "/admin/logs",
      "/admin/sandbox",
    ]);
  });
});
