import { describe, expect, it } from "vitest";

import { buildAdminPermissions } from "@/domains/admin";
import type { UserRole } from "@/domains/users";
import { parseOperationalLinks } from "@/lib/operational-links";

import { getAdminExternalLinks } from "./admin-external-links";

const CONFIGURED = parseOperationalLinks({
  POSTHOG_DASHBOARDS_URL: "https://us.posthog.com/project/12345/dashboard",
});
const NOT_CONFIGURED = parseOperationalLinks({});

const linksFor = (role: UserRole, links = CONFIGURED) =>
  getAdminExternalLinks(buildAdminPermissions({ role }), links);

describe("getAdminExternalLinks — one answer per role", () => {
  it.each(["admin", "developer"] as const)(
    "offers a %s the Analytics link, to the configured dashboards",
    (role) => {
      expect(linksFor(role)).toEqual([
        {
          label: "Analytics",
          href: "https://us.posthog.com/project/12345/dashboard",
        },
      ]);
    },
  );

  it.each(["writer", "user", "beta-tester"] as const)(
    "offers a %s nothing — they may not use developer tools",
    (role) => {
      expect(linksFor(role)).toEqual([]);
    },
  );

  it("agrees with the Logs page: exactly the people who may open it are offered the link", () => {
    const roles: UserRole[] = [
      "admin",
      "developer",
      "writer",
      "user",
      "beta-tester",
    ];
    for (const role of roles) {
      const permissions = buildAdminPermissions({ role });
      expect(linksFor(role).length > 0, role).toBe(
        permissions.canUseDeveloperTools,
      );
    }
  });
});

describe("getAdminExternalLinks — only what is really configured", () => {
  it("offers nothing, not even a disabled link, when no PostHog address is set", () => {
    expect(linksFor("admin", NOT_CONFIGURED)).toEqual([]);
  });

  it("offers nothing when the address was refused — a shared dashboard link, say", () => {
    const refused = parseOperationalLinks({
      POSTHOG_DASHBOARDS_URL: "https://us.posthog.com/shared/AbCdEf",
    });

    expect(refused.rejected).toEqual(["POSTHOG_DASHBOARDS_URL"]);
    expect(linksFor("admin", refused)).toEqual([]);
  });

  it("is not affected by the Grafana setting", () => {
    const grafanaOnly = parseOperationalLinks({
      GRAFANA_STACK_URL: "https://mystack.grafana.net",
    });

    expect(linksFor("admin", grafanaOnly)).toEqual([]);
  });

  it("follows the permissions it is given, not a role name", () => {
    expect(
      getAdminExternalLinks({ canUseDeveloperTools: false }, CONFIGURED),
    ).toEqual([]);
    expect(
      getAdminExternalLinks({ canUseDeveloperTools: true }, CONFIGURED),
    ).toHaveLength(1);
  });
});
