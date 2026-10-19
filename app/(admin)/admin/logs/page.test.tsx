import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.hoisted(() => vi.fn());
const forbidden = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_FORBIDDEN");
  }),
);
const config = vi.hoisted(() => ({
  telemetryConfig: {
    analytics: { state: "disabled" },
    observability: {
      metrics: { state: "disabled" },
      traces: { state: "disabled" },
      logs: { state: "disabled" },
    },
  } as Record<string, unknown>,
  operationalLinks: { grafana: null, posthog: null, rejected: [] } as Record<
    string,
    unknown
  >,
}));

vi.mock("next/navigation", () => ({ forbidden }));
vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in" },
  get telemetryConfig() {
    return config.telemetryConfig;
  },
  get operationalLinks() {
    return config.operationalLinks;
  },
}));
// The tabs and the Audit list have their own tests (and run in a browser):
// here they only have to show which one the page chose.
vi.mock("@/components/admin/logs/logs-tabs-nav", () => ({
  LogsTabsNav: ({ active }: { active: string }) => (
    <div data-testid="tabs" data-active={active} />
  ),
}));
vi.mock("@/components/admin/react-admin/logs/logs-list-app", () => ({
  AdminLogsListApp: () => <div data-testid="audit-list" />,
}));

import { SecretValue } from "@/lib/telemetry-config";
import { parseOperationalLinks } from "@/lib/operational-links";

import AdminLogsPage from "./page";

async function renderPage(tab?: string) {
  render(await AdminLogsPage({ searchParams: Promise.resolve({ tab }) }));
}

beforeEach(() => {
  requireUser.mockReset();
  forbidden.mockClear();
  requireUser.mockResolvedValue({ role: "admin" });
  config.telemetryConfig = {
    analytics: { state: "disabled" },
    observability: {
      metrics: { state: "disabled" },
      traces: { state: "disabled" },
      logs: { state: "disabled" },
    },
  };
  config.operationalLinks = { grafana: null, posthog: null, rejected: [] };
});

describe("who may open the Logs page, either tab", () => {
  it.each(["admin", "developer"])("opens for a %s", async (role) => {
    requireUser.mockResolvedValue({ role });

    await renderPage("system");
    expect(forbidden).not.toHaveBeenCalled();
    expect(screen.getByTestId("tabs")).toHaveAttribute("data-active", "system");
  });

  it.each(["writer", "user", "beta-tester"])(
    "is forbidden to a %s, on both tabs",
    async (role) => {
      requireUser.mockResolvedValue({ role });

      await expect(renderPage("system")).rejects.toThrow("NEXT_FORBIDDEN");
      await expect(renderPage()).rejects.toThrow("NEXT_FORBIDDEN");
      expect(forbidden).toHaveBeenCalledTimes(2);
    },
  );
});

describe("the tabs", () => {
  it("shows the Audit log by default, and nothing of the System tab", async () => {
    await renderPage();

    expect(screen.getByTestId("tabs")).toHaveAttribute("data-active", "audit");
    expect(screen.getByTestId("audit-list")).toBeInTheDocument();
    expect(
      screen.queryByText("Telemetry on this server"),
    ).not.toBeInTheDocument();
  });

  it.each(["audit", "SYSTEM", "bogus", "", "system "])(
    "shows the Audit log for the tab %j — only exactly `system` opens the System tab",
    async (tab) => {
      await renderPage(tab);

      expect(screen.getByTestId("audit-list")).toBeInTheDocument();
      expect(screen.getByTestId("tabs")).toHaveAttribute(
        "data-active",
        "audit",
      );
    },
  );

  it("shows the System tab, and not the Audit log, for ?tab=system", async () => {
    await renderPage("system");

    expect(screen.getByTestId("tabs")).toHaveAttribute("data-active", "system");
    expect(screen.queryByTestId("audit-list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Telemetry on this server",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Product analytics · PostHog",
      }),
    ).toBeInTheDocument();
  });

  it("no longer says the system pipeline is not wired up", async () => {
    await renderPage("system");

    expect(
      screen.queryByText("System log pipeline not yet wired up"),
    ).not.toBeInTheDocument();
  });
});

describe("the System tab's content", () => {
  it("shows every signal Off by default and no link", async () => {
    await renderPage("system");

    expect(screen.getAllByText("Off")).toHaveLength(4);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });

  it("shows the real sampling share of an enabled traces signal", async () => {
    config.telemetryConfig = {
      analytics: { state: "disabled" },
      observability: {
        metrics: { state: "disabled" },
        traces: {
          state: "enabled",
          sampleRatio: 0.25,
          connection: {
            endpoint: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
            instanceId: "987654",
            token: new SecretValue(`glc_${"z".repeat(30)}`),
          },
        },
        logs: { state: "disabled" },
      },
    };

    await renderPage("system");

    expect(screen.getByText(/about 25% of requests/)).toBeInTheDocument();
  });

  it("never lets an endpoint, instance id or token reach the page", async () => {
    const token = `glc_${"z".repeat(30)}`;
    const connection = {
      endpoint: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
      instanceId: "987654",
      token: new SecretValue(token),
    };
    config.telemetryConfig = {
      analytics: {
        state: "enabled",
        host: "https://us.i.posthog.com",
        projectToken: new SecretValue(`phc_${"y".repeat(30)}`),
      },
      observability: {
        metrics: { state: "enabled", connection },
        traces: { state: "enabled", connection, sampleRatio: 0.05 },
        logs: { state: "enabled", connection },
      },
    };

    await renderPage("system");

    const html = document.body.innerHTML;
    for (const secret of [
      token,
      `phc_${"y".repeat(30)}`,
      "987654",
      "otlp-gateway",
      "us.i.posthog.com",
    ]) {
      expect(html, `"${secret}" must not appear`).not.toContain(secret);
    }
    expect(screen.getAllByText("On")).toHaveLength(4);
  });

  it("shows the owner's dashboard links when they are configured", async () => {
    config.operationalLinks = parseOperationalLinks({
      GRAFANA_STACK_URL: "https://mystack.grafana.net",
      POSTHOG_DASHBOARDS_URL: "https://eu.posthog.com/project/7/dashboard",
    });

    await renderPage("system");

    expect(
      screen
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
        .sort(),
    ).toEqual(
      [
        "https://mystack.grafana.net/a/grafana-synthetic-monitoring-app/home",
        "https://mystack.grafana.net/alerting/list",
        "https://mystack.grafana.net/alerting/notifications",
        "https://mystack.grafana.net/dashboards",
        "https://mystack.grafana.net/explore",
        "https://eu.posthog.com/organization/billing",
        "https://eu.posthog.com/project/7/dashboard",
      ].sort(),
    );
  });
});
