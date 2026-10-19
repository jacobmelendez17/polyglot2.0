import { describe, expect, it } from "vitest";

import {
  parseTelemetryConfig,
  summarizeTelemetryConfig,
  type TelemetryEnvSource,
} from "@/lib/telemetry-config";

import {
  buildSignalRows,
  describeIssue,
  formatSamplePercent,
} from "./system-status";

const TOKEN = `glc_${"a".repeat(30)}`;
const POSTHOG_TOKEN = `phc_${"b".repeat(30)}`;
const GRAFANA_HOST = "https://otlp-gateway-prod-us-east-0.grafana.net/otlp";

const VALID: TelemetryEnvSource = {
  POSTHOG_ENABLED: "true",
  POSTHOG_FREE_PLAN_CONFIRMED: "true",
  POSTHOG_PROJECT_TOKEN: POSTHOG_TOKEN,
  POSTHOG_HOST: "https://us.i.posthog.com",
  TELEMETRY_METRICS_ENABLED: "true",
  TELEMETRY_TRACES_ENABLED: "true",
  TELEMETRY_LOGS_ENABLED: "true",
  GRAFANA_FREE_PLAN_CONFIRMED: "true",
  GRAFANA_OTLP_ENDPOINT: GRAFANA_HOST,
  GRAFANA_OTLP_INSTANCE_ID: "123456",
  GRAFANA_OTLP_TOKEN: TOKEN,
};

const rowsFor = (
  source: TelemetryEnvSource,
  appEnv: "development" | "preview" | "production" = "production",
  traceSampleRatio: number | null = 0.05,
) =>
  buildSignalRows(
    summarizeTelemetryConfig(parseTelemetryConfig(source, appEnv)),
    { traceSampleRatio },
  );

describe("buildSignalRows", () => {
  it("lists the four signals in a fixed order, each by its vendor and its switch", () => {
    const rows = rowsFor({});

    expect(rows.map((row) => [row.id, row.vendor, row.switchName])).toEqual([
      ["analytics", "PostHog", "POSTHOG_ENABLED"],
      ["metrics", "Grafana Cloud", "TELEMETRY_METRICS_ENABLED"],
      ["traces", "Grafana Cloud", "TELEMETRY_TRACES_ENABLED"],
      ["logs", "Grafana Cloud", "TELEMETRY_LOGS_ENABLED"],
    ]);
  });

  it("says Off, and gives no reason, for everything that is switched off — the default", () => {
    for (const row of rowsFor({})) {
      expect(row.state).toBe("off");
      expect(row.stateLabel).toBe("Off");
      expect(row.reasons).toEqual([]);
      expect(row.summary).toMatch(/^Not sending/);
    }
  });

  it("says On for what is enabled, in words that name what is sent and to whom", () => {
    const [analytics, metrics, traces, logs] = rowsFor(VALID);

    for (const row of [analytics, metrics, traces, logs]) {
      expect(row!.state).toBe("on");
      expect(row!.stateLabel).toBe("On");
      expect(row!.reasons).toEqual([]);
    }
    expect(analytics!.summary).toContain(
      "only for learners who have turned analytics on",
    );
    expect(metrics!.summary).toContain("Grafana Cloud");
    expect(logs!.summary).toContain(
      "never messages or anything a learner typed",
    );
  });

  it("says how much of the traffic is traced, from the real sampling share", () => {
    const traces = (ratio: number | null) =>
      rowsFor(VALID, "production", ratio)[2]!.summary;

    expect(traces(0.05)).toContain("about 5% of requests");
    expect(traces(0.005)).toContain("about 0.5% of requests");
    expect(traces(1)).toContain("about 100% of requests");
    expect(traces(0)).toBe(
      "Switched on, but the sampling share is 0%, so no traces are sent.",
    );
    expect(traces(null)).toContain("a sample of requests");
  });

  it("says Blocked, with the reasons by setting name, when a switch is on but cannot run safely", () => {
    const rows = rowsFor({
      POSTHOG_ENABLED: "true",
      TELEMETRY_METRICS_ENABLED: "true",
    });

    const [analytics, metrics] = rows;
    expect(analytics!.state).toBe("blocked");
    expect(analytics!.stateLabel).toBe("Blocked");
    expect(analytics!.summary).toContain("behaves as off");
    expect(analytics!.reasons.map((reason) => reason.setting)).toEqual([
      "POSTHOG_FREE_PLAN_CONFIRMED",
      "POSTHOG_PROJECT_TOKEN",
      "POSTHOG_HOST",
    ]);
    expect(metrics!.reasons.map((reason) => reason.setting)).toEqual([
      "GRAFANA_FREE_PLAN_CONFIRMED",
      "GRAFANA_OTLP_ENDPOINT",
      "GRAFANA_OTLP_INSTANCE_ID",
      "GRAFANA_OTLP_TOKEN",
    ]);
  });

  it("explains a non-production server in terms of the setting that allows it", () => {
    const [analytics] = rowsFor(VALID, "preview");

    expect(analytics!.state).toBe("blocked");
    expect(analytics!.reasons).toEqual([
      {
        setting: "TELEMETRY_ALLOW_NON_PRODUCTION",
        message:
          "isn't “true”, and this isn't production, so nothing is sent from here.",
      },
    ]);
  });

  it("never contains a credential, a host or an id — it has none to show", () => {
    const everything = JSON.stringify([
      rowsFor(VALID),
      // Valid, then broken in each way a pasted secret could end up wrong.
      rowsFor({ ...VALID, GRAFANA_OTLP_TOKEN: `glsa_${"c".repeat(30)}` }),
      rowsFor({ ...VALID, POSTHOG_PROJECT_TOKEN: `phx_${"d".repeat(30)}` }),
      rowsFor({
        ...VALID,
        GRAFANA_OTLP_ENDPOINT: "https://attacker.example/otlp",
      }),
      rowsFor({ ...VALID, POSTHOG_HOST: "https://attacker.example" }),
    ]);

    for (const secret of [
      TOKEN,
      POSTHOG_TOKEN,
      "glsa_",
      "phx_",
      "attacker.example",
      GRAFANA_HOST,
      "grafana.net",
      "123456",
      "us.i.posthog.com",
    ]) {
      expect(everything, `"${secret}" must not appear`).not.toContain(secret);
    }
  });
});

describe("describeIssue", () => {
  it.each([
    ["missing_setting", "isn't set."],
    ["invalid_setting", "has a value that isn't accepted."],
  ] as const)("describes %s without quoting anything", (code, message) => {
    expect(describeIssue({ code, setting: "ANY_SETTING" })).toEqual({
      setting: "ANY_SETTING",
      message,
    });
  });

  it("asks for the Free-plan check when the confirmation is missing", () => {
    expect(
      describeIssue({
        code: "plan_not_confirmed",
        setting: "GRAFANA_FREE_PLAN_CONFIRMED",
      }).message,
    ).toContain("Free plan, with no card");
  });
});

describe("formatSamplePercent", () => {
  it.each([
    [0.05, "5%"],
    [0.5, "50%"],
    [1, "100%"],
    [0.001, "0.1%"],
    [0.0001, "0%"],
    [0.0333, "3.3%"],
  ])("shows %s as %s", (ratio, expected) => {
    expect(formatSamplePercent(ratio)).toBe(expected);
  });
});
