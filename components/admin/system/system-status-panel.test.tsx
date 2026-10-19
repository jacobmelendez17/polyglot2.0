import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseOperationalLinks } from "@/lib/operational-links";
import {
  parseTelemetryConfig,
  summarizeTelemetryConfig,
  type TelemetryEnvSource,
} from "@/lib/telemetry-config";

import { buildSignalRows } from "./system-status";
import { SystemStatusPanel } from "./system-status-panel";

const NO_LINKS = parseOperationalLinks({});
const LINKS = parseOperationalLinks({
  GRAFANA_STACK_URL: "https://mystack.grafana.net",
  POSTHOG_DASHBOARDS_URL: "https://us.posthog.com/project/12345/dashboard",
});

const TOKEN = `glc_${"a".repeat(30)}`;
const ENABLED: TelemetryEnvSource = {
  POSTHOG_ENABLED: "true",
  POSTHOG_FREE_PLAN_CONFIRMED: "true",
  POSTHOG_PROJECT_TOKEN: `phc_${"b".repeat(30)}`,
  POSTHOG_HOST: "https://us.i.posthog.com",
  TELEMETRY_METRICS_ENABLED: "true",
  TELEMETRY_TRACES_ENABLED: "true",
  GRAFANA_FREE_PLAN_CONFIRMED: "true",
  GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
  GRAFANA_OTLP_INSTANCE_ID: "123456",
  GRAFANA_OTLP_TOKEN: TOKEN,
};

function signals(source: TelemetryEnvSource, ratio: number | null = 0.05) {
  return buildSignalRows(
    summarizeTelemetryConfig(parseTelemetryConfig(source, "production")),
    { traceSampleRatio: ratio },
  );
}

function renderPanel(
  source: TelemetryEnvSource = {},
  links = NO_LINKS,
  ratio: number | null = 0.05,
) {
  return render(
    <SystemStatusPanel signals={signals(source, ratio)} links={links} />,
  );
}

const card = (name: string) =>
  screen.getByRole("heading", { level: 3, name }).closest("[data-slot=card]")!;

describe("the telemetry section", () => {
  it("is a section of its own with one card per signal, in order", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Telemetry on this server",
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
        .slice(0, 4),
    ).toEqual([
      "Product analytics · PostHog",
      "Metrics · Grafana Cloud",
      "Traces · Grafana Cloud",
      "Logs · Grafana Cloud",
    ]);
  });

  it("says Off, in words and not only colour, for everything by default, and names each switch", () => {
    renderPanel();

    expect(screen.getAllByText("Off")).toHaveLength(4);
    expect(screen.queryByText("On")).not.toBeInTheDocument();
    expect(screen.getByText("POSTHOG_ENABLED")).toBeInTheDocument();
    expect(screen.getByText("TELEMETRY_METRICS_ENABLED")).toBeInTheDocument();
    expect(screen.getByText("TELEMETRY_TRACES_ENABLED")).toBeInTheDocument();
    expect(screen.getByText("TELEMETRY_LOGS_ENABLED")).toBeInTheDocument();
  });

  it("says On for what is enabled and how much of the traffic is traced", () => {
    renderPanel(ENABLED, NO_LINKS, 0.05);

    const metrics = within(card("Metrics · Grafana Cloud") as HTMLElement);
    expect(metrics.getByText("On")).toBeInTheDocument();
    const traces = within(card("Traces · Grafana Cloud") as HTMLElement);
    expect(traces.getByText(/about 5% of requests/)).toBeInTheDocument();
    // Logs were not switched on in this configuration.
    expect(
      within(card("Logs · Grafana Cloud") as HTMLElement).getByText("Off"),
    ).toBeInTheDocument();
  });

  it("says Blocked and lists the settings at fault, by name, when a switch cannot run", () => {
    renderPanel({ POSTHOG_ENABLED: "true" });

    const analytics = within(
      card("Product analytics · PostHog") as HTMLElement,
    );
    expect(analytics.getByText("Blocked")).toBeInTheDocument();
    expect(analytics.getByText(/behaves as off/)).toBeInTheDocument();
    expect(
      analytics.getByText("POSTHOG_FREE_PLAN_CONFIRMED"),
    ).toBeInTheDocument();
    expect(analytics.getByText("POSTHOG_PROJECT_TOKEN")).toBeInTheDocument();
    expect(analytics.getByText("POSTHOG_HOST")).toBeInTheDocument();
  });

  it("is honest that it cannot see the other side", () => {
    renderPanel();

    expect(
      screen.getByText(
        /can’t see whether PostHog or Grafana is actually receiving/,
      ),
    ).toBeInTheDocument();
  });

  it("holds no credential, host or id, however the configuration is broken", () => {
    const html = [
      renderPanel(ENABLED).container.innerHTML,
      renderPanel({ ...ENABLED, GRAFANA_OTLP_TOKEN: "nonsense-secret-value" })
        .container.innerHTML,
    ].join("");

    for (const secret of [
      TOKEN,
      "nonsense-secret-value",
      `phc_${"b".repeat(30)}`,
      "123456",
      "otlp-gateway-prod-us-east-0",
      "us.i.posthog.com",
    ]) {
      expect(html, `"${secret}" must not appear`).not.toContain(secret);
    }
  });
});

describe("the dashboards and alerts section", () => {
  it("links to the owner's own Grafana pages and PostHog dashboards when they are configured", () => {
    renderPanel({}, LINKS);

    const grafana = within(card("Grafana Cloud") as HTMLElement);
    expect(
      grafana
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      [
        "Dashboards (opens in a new tab)",
        "https://mystack.grafana.net/dashboards",
      ],
      [
        "Alert rules (opens in a new tab)",
        "https://mystack.grafana.net/alerting/list",
      ],
      [
        "Email contact points (opens in a new tab)",
        "https://mystack.grafana.net/alerting/notifications",
      ],
      [
        "Explore metrics, traces and logs (opens in a new tab)",
        "https://mystack.grafana.net/explore",
      ],
      [
        "Uptime check (Synthetic Monitoring) (opens in a new tab)",
        "https://mystack.grafana.net/a/grafana-synthetic-monitoring-app/home",
      ],
    ]);
    const posthog = within(card("PostHog") as HTMLElement);
    expect(
      posthog
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      [
        "Dashboards (opens in a new tab)",
        "https://us.posthog.com/project/12345/dashboard",
      ],
      [
        "Billing and usage (opens in a new tab)",
        "https://us.posthog.com/organization/billing",
      ],
    ]);
  });

  it("opens every link in a new tab, cut off from this window, and says so", () => {
    renderPanel({}, LINKS);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(7);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link).toHaveAccessibleName(/\(opens in a new tab\)$/);
    }
  });

  it("makes no link at all, and says which setting would add one, when nothing is configured", () => {
    renderPanel({}, NO_LINKS);

    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.getByText("GRAFANA_STACK_URL")).toBeInTheDocument();
    expect(screen.getByText("POSTHOG_DASHBOARDS_URL")).toBeInTheDocument();
    expect(screen.getAllByText(/No link yet/)).toHaveLength(2);
  });

  it("hides the links of a setting that was refused, and says it was, by name", () => {
    renderPanel(
      {},
      parseOperationalLinks({
        GRAFANA_STACK_URL: "https://evil.example/mystack.grafana.net",
        POSTHOG_DASHBOARDS_URL: "https://us.posthog.com/shared/AbCdEf",
      }),
    );

    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(
      screen.getAllByText(/isn’t an address this page will link to/),
    ).toHaveLength(2);
    expect(document.body.innerHTML).not.toContain("evil.example");
    expect(document.body.innerHTML).not.toContain("AbCdEf");
  });

  it("is independent per vendor: one configured, one not", () => {
    renderPanel(
      {},
      parseOperationalLinks({
        POSTHOG_DASHBOARDS_URL: "https://eu.posthog.com",
      }),
    );

    expect(
      within(card("PostHog") as HTMLElement).getAllByRole("link"),
    ).toHaveLength(2);
    expect(
      within(card("Grafana Cloud") as HTMLElement).queryAllByRole("link"),
    ).toEqual([]);
  });
});

describe("the rest of the page", () => {
  it("names the two health endpoints and says they don't depend on the vendors", () => {
    renderPanel();

    const health = screen
      .getByRole("heading", { level: 2, name: "Health checks" })
      .closest("section")!;
    expect(within(health).getByText("/api/health")).toBeInTheDocument();
    expect(within(health).getByText("/api/health/ready")).toBeInTheDocument();
    expect(health).toHaveTextContent("don’t depend on PostHog or Grafana");
  });

  it("does not pretend to measure the free allowance, and says where to look", () => {
    renderPanel();

    const limits = screen
      .getByRole("heading", { level: 2, name: "Free-plan limits" })
      .closest("section")!;
    expect(limits).toHaveTextContent("can’t see how much");
    expect(
      within(limits).getByText("infra/telemetry/README.md"),
    ).toBeInTheDocument();
    expect(
      limits.querySelector("progress, meter, [role=progressbar]"),
    ).toBeNull();
  });

  it("gives every section a heading and keeps the heading order", () => {
    renderPanel({}, LINKS);

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Telemetry on this server",
      "Dashboards and alerts",
      "Health checks",
      "Free-plan limits",
    ]);
  });
});
