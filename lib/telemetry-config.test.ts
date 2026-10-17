import { readFileSync } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRACE_SAMPLE_RATIO,
  SecretValue,
  TELEMETRY_SETTINGS,
  TELEMETRY_SWITCHES,
  parseTelemetryConfig,
  summarizeTelemetryConfig,
  type AppEnvironment,
  type ProviderState,
  type TelemetryEnvSource,
  type TelemetryIssue,
} from "./telemetry-config";

// Credentials are assembled at run time so no literal in this file looks like
// a real PostHog or Grafana token to a secret scanner.
const fakeToken = (prefix: string) => [prefix, "x".repeat(40)].join("_");
const POSTHOG_TOKEN = fakeToken("phc");
const GRAFANA_TOKEN = fakeToken("glc");

const POSTHOG: TelemetryEnvSource = {
  POSTHOG_ENABLED: "true",
  POSTHOG_FREE_PLAN_CONFIRMED: "true",
  POSTHOG_PROJECT_TOKEN: POSTHOG_TOKEN,
  POSTHOG_HOST: "https://us.i.posthog.com",
};

const GRAFANA_CONNECTION: TelemetryEnvSource = {
  GRAFANA_FREE_PLAN_CONFIRMED: "true",
  GRAFANA_OTLP_ENDPOINT: "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
  GRAFANA_OTLP_INSTANCE_ID: "123456",
  GRAFANA_OTLP_TOKEN: GRAFANA_TOKEN,
};

const ALL_SIGNALS: TelemetryEnvSource = {
  TELEMETRY_METRICS_ENABLED: "true",
  TELEMETRY_TRACES_ENABLED: "true",
  TELEMETRY_LOGS_ENABLED: "true",
};

const GRAFANA_ALL: TelemetryEnvSource = {
  ...GRAFANA_CONNECTION,
  ...ALL_SIGNALS,
};

function parse(
  source: TelemetryEnvSource,
  appEnv: AppEnvironment = "production",
) {
  return parseTelemetryConfig(source, appEnv);
}

function enabled<A extends object>(
  config: ProviderState<A>,
): A & { state: "enabled" } {
  if (config.state !== "enabled") {
    throw new Error(`expected an enabled provider, got ${config.state}`);
  }
  return config;
}

function issuesOf(config: ProviderState): readonly TelemetryIssue[] {
  if (config.state !== "blocked") {
    throw new Error(`expected a blocked provider, got ${config.state}`);
  }
  return config.issues;
}

describe("telemetry config defaults", () => {
  it("is entirely disabled when nothing is set", () => {
    const config = parse({});
    expect(config.analytics).toEqual({ state: "disabled" });
    expect(config.observability).toEqual({
      metrics: { state: "disabled" },
      traces: { state: "disabled" },
      logs: { state: "disabled" },
    });
  });

  it("stays disabled, and silent, when the switches are off but credentials are present", () => {
    const config = parse({
      ...POSTHOG,
      ...GRAFANA_ALL,
      POSTHOG_ENABLED: "false",
      TELEMETRY_METRICS_ENABLED: "false",
      TELEMETRY_TRACES_ENABLED: "",
      TELEMETRY_LOGS_ENABLED: undefined,
    });
    expect(config.analytics).toEqual({ state: "disabled" });
    expect(config.observability.metrics).toEqual({ state: "disabled" });
    expect(config.observability.traces).toEqual({ state: "disabled" });
    expect(config.observability.logs).toEqual({ state: "disabled" });
  });

  it("does not read, validate or report a disabled provider's settings", () => {
    const config = parse({
      POSTHOG_PROJECT_TOKEN: "not a token",
      POSTHOG_HOST: "http://elsewhere.example",
      GRAFANA_OTLP_TOKEN: "also not a token",
      TELEMETRY_TRACE_SAMPLE_RATIO: "lots",
    });
    expect(summarizeTelemetryConfig(config)).toEqual({
      analytics: { state: "disabled", issues: [] },
      metrics: { state: "disabled", issues: [] },
      traces: { state: "disabled", issues: [] },
      logs: { state: "disabled", issues: [] },
    });
  });

  it("reads nothing but the four enable switches while everything is off", () => {
    // The claim in the docs — a disabled provider's other settings are not
    // even read — made checkable: record every variable the parser touches.
    const read: string[] = [];
    const source = new Proxy<Record<string, string>>(
      {},
      {
        get(_target, name) {
          if (typeof name === "string") read.push(name);
          return undefined;
        },
      },
    );

    parse(source);

    expect(read.sort()).toEqual([
      "POSTHOG_ENABLED",
      "TELEMETRY_LOGS_ENABLED",
      "TELEMETRY_METRICS_ENABLED",
      "TELEMETRY_TRACES_ENABLED",
    ]);
  });

  it("is fully off when every switch is forced to false over an otherwise valid configuration", () => {
    // What Vitest and the E2E server rely on: whatever .env.local enables,
    // forcing TELEMETRY_SWITCHES to "false" leaves nothing on.
    const forcedOff = Object.fromEntries(
      TELEMETRY_SWITCHES.map((name) => [name, "false"]),
    );
    const config = parse({ ...POSTHOG, ...GRAFANA_ALL, ...forcedOff });
    expect(Object.values(summarizeTelemetryConfig(config))).toEqual(
      Array(4).fill({ state: "disabled", issues: [] }),
    );
  });

  it("lists every on-switch in TELEMETRY_SWITCHES", () => {
    // Every setting the parser knows about is set to "true" (credentials and
    // confirmations valid) except the listed switches, which are forced off.
    // A switch missing from TELEMETRY_SWITCHES would still be "true" here and
    // turn something on — so the test environments' force-off list is complete.
    const everythingElseTrue = Object.fromEntries(
      TELEMETRY_SETTINGS.map((name) => [name, "true"]),
    );
    const forcedOff = Object.fromEntries(
      TELEMETRY_SWITCHES.map((name) => [name, "false"]),
    );
    const config = parse({
      ...everythingElseTrue,
      ...POSTHOG,
      ...GRAFANA_CONNECTION,
      ...forcedOff,
    });
    expect(Object.values(summarizeTelemetryConfig(config))).toEqual(
      Array(4).fill({ state: "disabled", issues: [] }),
    );
  });
});

describe("telemetry config switches", () => {
  it.each(["true", "TRUE", " True ", "true\n"])("treats %j as on", (value) => {
    expect(parse({ ...POSTHOG, POSTHOG_ENABLED: value }).analytics.state).toBe(
      "enabled",
    );
  });

  it.each(["yes", "1", "on", "enabled", "tru"])(
    "refuses to guess what %j means: the provider is blocked, not enabled",
    (value) => {
      const { analytics } = parse({ ...POSTHOG, POSTHOG_ENABLED: value });
      expect(issuesOf(analytics)).toEqual([
        { code: "invalid_setting", setting: "POSTHOG_ENABLED" },
      ]);
    },
  );
});

describe("PostHog", () => {
  it("is enabled with a normalized connection when every gate passes", () => {
    const analytics = enabled(parse(POSTHOG).analytics);
    expect(analytics.host).toBe("https://us.i.posthog.com");
    expect(analytics.projectToken.reveal()).toBe(POSTHOG_TOKEN);
  });

  it.each([
    ["https://us.i.posthog.com", "https://us.i.posthog.com"],
    ["https://us.i.posthog.com/", "https://us.i.posthog.com"],
    ["https://eu.i.posthog.com", "https://eu.i.posthog.com"],
    ["https://EU.i.posthog.com//", "https://eu.i.posthog.com"],
  ])("accepts the ingestion host %j", (raw, normalized) => {
    expect(
      enabled(parse({ ...POSTHOG, POSTHOG_HOST: raw }).analytics).host,
    ).toBe(normalized);
  });

  it.each([
    ["http://us.i.posthog.com", "plain http"],
    ["https://us.posthog.com", "the app host, not the ingestion host"],
    ["https://app.posthog.com", "the legacy app host"],
    ["https://example.com", "an unrelated host"],
    ["https://us.i.posthog.com.attacker.example", "a look-alike host"],
    ["https://us.i.posthog.com/capture", "a path"],
    ["https://us.i.posthog.com/?token=1", "a query"],
    ["https://us.i.posthog.com/#x", "a fragment"],
    ["https://user:pass@us.i.posthog.com", "embedded credentials"],
    ["https://us.i.posthog.com:8443", "a port"],
    ["us.i.posthog.com", "no scheme"],
    ["not a url", "text"],
  ])("blocks the host %j (%s)", (raw) => {
    const { analytics } = parse({ ...POSTHOG, POSTHOG_HOST: raw });
    expect(issuesOf(analytics)).toEqual([
      { code: "invalid_setting", setting: "POSTHOG_HOST" },
    ]);
  });

  it.each([
    ["a personal API key", fakeToken("phx")],
    ["a secure feature-flag key", fakeToken("phs")],
    ["a bare string", "x".repeat(40)],
    ["too short", "phc_short"],
    ["a token with a space in it", `phc_${"x".repeat(20)} ${"y".repeat(20)}`],
  ])("blocks a project token that is %s", (_label, token) => {
    const { analytics } = parse({ ...POSTHOG, POSTHOG_PROJECT_TOKEN: token });
    expect(issuesOf(analytics)).toEqual([
      { code: "invalid_setting", setting: "POSTHOG_PROJECT_TOKEN" },
    ]);
  });

  it("reports each missing credential separately", () => {
    const { analytics } = parse({
      POSTHOG_ENABLED: "true",
      POSTHOG_FREE_PLAN_CONFIRMED: "true",
      POSTHOG_PROJECT_TOKEN: "   ",
    });
    expect(issuesOf(analytics)).toEqual([
      { code: "missing_setting", setting: "POSTHOG_PROJECT_TOKEN" },
      { code: "missing_setting", setting: "POSTHOG_HOST" },
    ]);
  });
});

describe("Grafana Cloud signals", () => {
  it("enables only the signals asked for, from one shared connection", () => {
    const { observability } = parse({
      ...GRAFANA_CONNECTION,
      TELEMETRY_METRICS_ENABLED: "true",
    });
    const metrics = enabled(observability.metrics);
    expect(metrics.connection.endpoint).toBe(
      "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
    );
    expect(metrics.connection.instanceId).toBe("123456");
    expect(metrics.connection.token.reveal()).toBe(GRAFANA_TOKEN);
    expect(observability.traces).toEqual({ state: "disabled" });
    expect(observability.logs).toEqual({ state: "disabled" });
  });

  it("enables all three signals, with the 5% default trace sampling", () => {
    const { observability } = parse(GRAFANA_ALL);
    expect(enabled(observability.metrics).state).toBe("enabled");
    expect(enabled(observability.logs).state).toBe("enabled");
    expect(enabled(observability.traces).sampleRatio).toBe(
      DEFAULT_TRACE_SAMPLE_RATIO,
    );
    expect(DEFAULT_TRACE_SAMPLE_RATIO).toBe(0.05);
  });

  it.each([
    ["0", 0],
    ["0.25", 0.25],
    [".5", 0.5],
    ["0.05", 0.05],
    ["1", 1],
    ["1.0", 1],
  ])(
    "accepts the trace sampling ratio %j (0 turns tracing to nothing)",
    (raw, ratio) => {
      const { traces } = parse({
        ...GRAFANA_ALL,
        TELEMETRY_TRACE_SAMPLE_RATIO: raw,
      }).observability;
      expect(enabled(traces).sampleRatio).toBe(ratio);
    },
  );

  it.each([
    "1.5",
    "-0.1",
    "2",
    "abc",
    "5%",
    "1e-2",
    "0x1",
    "0.",
    "NaN",
    "Infinity",
  ])("blocks only the traces signal for the sampling ratio %j", (raw) => {
    const { observability } = parse({
      ...GRAFANA_ALL,
      TELEMETRY_TRACE_SAMPLE_RATIO: raw,
    });
    expect(issuesOf(observability.traces)).toEqual([
      { code: "invalid_setting", setting: "TELEMETRY_TRACE_SAMPLE_RATIO" },
    ]);
    expect(observability.metrics.state).toBe("enabled");
    expect(observability.logs.state).toBe("enabled");
  });

  it.each([
    ["https://otlp-gateway-prod-us-east-0.grafana.net/otlp", true],
    ["https://otlp-gateway-prod-us-east-0.grafana.net/otlp/", true],
    ["http://otlp-gateway-prod-us-east-0.grafana.net/otlp", false],
    ["https://otlp-gateway-prod-us-east-0.grafana.net", false],
    ["https://otlp-gateway-prod-us-east-0.grafana.net/otlp/v1/metrics", false],
    ["https://otlp-gateway-prod-us-east-0.grafana.net/otlp?x=1", false],
    ["https://otlp-gateway-prod-us-east-0.grafana.net:4318/otlp", false],
    ["https://user:pw@otlp-gateway-prod-us-east-0.grafana.net/otlp", false],
    ["https://example.com/otlp", false],
    ["https://grafana.net/otlp", false],
    ["https://otlp-gateway.grafana.net.attacker.example/otlp", false],
    ["https://attacker.example/otlp?host=x.grafana.net", false],
    ["otlp-gateway-prod-us-east-0.grafana.net/otlp", false],
  ])("judges the OTLP endpoint %j (accepted: %s)", (raw, accepted) => {
    const { metrics } = parse({
      ...GRAFANA_CONNECTION,
      TELEMETRY_METRICS_ENABLED: "true",
      GRAFANA_OTLP_ENDPOINT: raw,
    }).observability;
    if (accepted) {
      expect(enabled(metrics).connection.endpoint).toBe(
        "https://otlp-gateway-prod-us-east-0.grafana.net/otlp",
      );
    } else {
      expect(issuesOf(metrics)).toEqual([
        { code: "invalid_setting", setting: "GRAFANA_OTLP_ENDPOINT" },
      ]);
    }
  });

  it.each(["abc", "12 34", "-1", "1.5", "1".repeat(16)])(
    "blocks the instance id %j",
    (raw) => {
      const { metrics } = parse({
        ...GRAFANA_CONNECTION,
        TELEMETRY_METRICS_ENABLED: "true",
        GRAFANA_OTLP_INSTANCE_ID: raw,
      }).observability;
      expect(issuesOf(metrics)).toEqual([
        { code: "invalid_setting", setting: "GRAFANA_OTLP_INSTANCE_ID" },
      ]);
    },
  );

  it.each([
    ["a service-account token", fakeToken("glsa")],
    ["a bare string", "x".repeat(40)],
    ["too short", "glc_short"],
  ])("blocks an OTLP token that is %s", (_label, token) => {
    const { metrics } = parse({
      ...GRAFANA_CONNECTION,
      TELEMETRY_METRICS_ENABLED: "true",
      GRAFANA_OTLP_TOKEN: token,
    }).observability;
    expect(issuesOf(metrics)).toEqual([
      { code: "invalid_setting", setting: "GRAFANA_OTLP_TOKEN" },
    ]);
  });

  it("blocks every requested signal, and only those, when the shared connection is incomplete", () => {
    const { observability } = parse({
      GRAFANA_FREE_PLAN_CONFIRMED: "true",
      TELEMETRY_METRICS_ENABLED: "true",
      TELEMETRY_LOGS_ENABLED: "true",
    });
    const missing = [
      { code: "missing_setting", setting: "GRAFANA_OTLP_ENDPOINT" },
      { code: "missing_setting", setting: "GRAFANA_OTLP_INSTANCE_ID" },
      { code: "missing_setting", setting: "GRAFANA_OTLP_TOKEN" },
    ];
    expect(issuesOf(observability.metrics)).toEqual(missing);
    expect(issuesOf(observability.logs)).toEqual(missing);
    expect(observability.traces).toEqual({ state: "disabled" });
  });

  it("blocks just the signal whose own switch is mistyped", () => {
    const { observability } = parse({
      ...GRAFANA_ALL,
      TELEMETRY_LOGS_ENABLED: "yes",
    });
    expect(issuesOf(observability.logs)).toEqual([
      { code: "invalid_setting", setting: "TELEMETRY_LOGS_ENABLED" },
    ]);
    expect(observability.metrics.state).toBe("enabled");
    expect(observability.traces.state).toBe("enabled");
  });
});

describe("the $0 plan gate (spec 27 §3.2 and §15)", () => {
  it.each([undefined, "", "false", "yes", "1"])(
    "blocks PostHog until the Free plan is confirmed (confirmation: %j)",
    (value) => {
      const { analytics } = parse({
        ...POSTHOG,
        POSTHOG_FREE_PLAN_CONFIRMED: value,
      });
      expect(issuesOf(analytics)).toEqual([
        { code: "plan_not_confirmed", setting: "POSTHOG_FREE_PLAN_CONFIRMED" },
      ]);
    },
  );

  it("blocks every requested Grafana signal until the Free plan is confirmed", () => {
    const { observability } = parse({
      ...GRAFANA_ALL,
      GRAFANA_FREE_PLAN_CONFIRMED: undefined,
    });
    const gate = [
      { code: "plan_not_confirmed", setting: "GRAFANA_FREE_PLAN_CONFIRMED" },
    ];
    expect(issuesOf(observability.metrics)).toEqual(gate);
    expect(issuesOf(observability.traces)).toEqual(gate);
    expect(issuesOf(observability.logs)).toEqual(gate);
  });

  it("keeps the two confirmations separate: one provider's does not clear the other", () => {
    const config = parse({
      ...POSTHOG,
      ...GRAFANA_ALL,
      GRAFANA_FREE_PLAN_CONFIRMED: undefined,
    });
    expect(config.analytics.state).toBe("enabled");
    expect(config.observability.metrics.state).toBe("blocked");

    const other = parse({
      ...POSTHOG,
      ...GRAFANA_ALL,
      POSTHOG_FREE_PLAN_CONFIRMED: undefined,
    });
    expect(other.analytics.state).toBe("blocked");
    expect(other.observability.metrics.state).toBe("enabled");
  });
});

describe("non-production environments", () => {
  it.each<AppEnvironment>(["development", "preview"])(
    "blocks a fully valid, confirmed configuration in %s unless non-production telemetry is allowed",
    (appEnv) => {
      const config = parse({ ...POSTHOG, ...GRAFANA_ALL }, appEnv);
      const gate = [
        {
          code: "non_production_not_allowed",
          setting: "TELEMETRY_ALLOW_NON_PRODUCTION",
        },
      ];
      expect(issuesOf(config.analytics)).toEqual(gate);
      expect(issuesOf(config.observability.metrics)).toEqual(gate);
      expect(issuesOf(config.observability.traces)).toEqual(gate);
      expect(issuesOf(config.observability.logs)).toEqual(gate);
    },
  );

  it.each<AppEnvironment>(["development", "preview"])(
    "enables it in %s once non-production telemetry is explicitly allowed",
    (appEnv) => {
      const config = parse(
        {
          ...POSTHOG,
          ...GRAFANA_ALL,
          TELEMETRY_ALLOW_NON_PRODUCTION: "true",
        },
        appEnv,
      );
      expect(config.analytics.state).toBe("enabled");
      expect(config.observability.metrics.state).toBe("enabled");
    },
  );

  it("does not accept a mistyped allowance", () => {
    const { analytics } = parse(
      { ...POSTHOG, TELEMETRY_ALLOW_NON_PRODUCTION: "yes" },
      "preview",
    );
    expect(analytics.state).toBe("blocked");
  });

  it("does not need the allowance in production", () => {
    expect(parse(POSTHOG, "production").analytics.state).toBe("enabled");
    expect(
      parse(
        { ...POSTHOG, TELEMETRY_ALLOW_NON_PRODUCTION: "false" },
        "production",
      ).analytics.state,
    ).toBe("enabled");
  });

  it("lists every reason a provider is blocked, in a stable order", () => {
    const { analytics } = parse(
      {
        POSTHOG_ENABLED: "yes",
        POSTHOG_PROJECT_TOKEN: fakeToken("phx"),
      },
      "development",
    );
    expect(issuesOf(analytics)).toEqual([
      { code: "invalid_setting", setting: "POSTHOG_ENABLED" },
      { code: "plan_not_confirmed", setting: "POSTHOG_FREE_PLAN_CONFIRMED" },
      {
        code: "non_production_not_allowed",
        setting: "TELEMETRY_ALLOW_NON_PRODUCTION",
      },
      { code: "invalid_setting", setting: "POSTHOG_PROJECT_TOKEN" },
      { code: "missing_setting", setting: "POSTHOG_HOST" },
    ]);
  });
});

describe("secrets and diagnostics", () => {
  it("never reveals a SecretValue by accident", () => {
    const secret = new SecretValue("super-secret-value");
    expect(secret.reveal()).toBe("super-secret-value");
    expect(String(secret)).toBe("[REDACTED]");
    expect(`${secret}`).toBe("[REDACTED]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
    expect(inspect(secret)).toBe("[REDACTED]");
    expect(inspect({ nested: { secret } }, { depth: null })).not.toContain(
      "super-secret-value",
    );
    expect(Object.keys(secret)).toEqual([]);
    expect(JSON.stringify(Object.entries(secret))).toBe("[]");
  });

  it("keeps every credential out of a serialized or inspected configuration", () => {
    const config = parse({ ...POSTHOG, ...GRAFANA_ALL });
    for (const rendered of [
      JSON.stringify(config),
      inspect(config, { depth: null }),
    ]) {
      expect(rendered).not.toContain(POSTHOG_TOKEN);
      expect(rendered).not.toContain(GRAFANA_TOKEN);
    }
    expect(JSON.stringify(config)).toContain("[REDACTED]");
  });

  it("summarizes to states and issue codes only", () => {
    const summary = summarizeTelemetryConfig(
      parse({ ...POSTHOG, ...GRAFANA_ALL }),
    );
    expect(summary).toEqual({
      analytics: { state: "enabled", issues: [] },
      metrics: { state: "enabled", issues: [] },
      traces: { state: "enabled", issues: [] },
      logs: { state: "enabled", issues: [] },
    });
    const text = JSON.stringify(summary);
    for (const value of [
      POSTHOG_TOKEN,
      GRAFANA_TOKEN,
      "123456",
      "grafana.net",
      "posthog.com",
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it("never echoes a rejected value into an issue", () => {
    // A secret pasted into the wrong variable is the realistic leak: the
    // diagnostic must name the variable and never quote what was in it.
    const leaked = "LEAKED-secret-value-9f3a";
    const config = parse(
      {
        ...POSTHOG,
        ...GRAFANA_ALL,
        POSTHOG_PROJECT_TOKEN: leaked,
        POSTHOG_HOST: `https://${leaked}.example/${leaked}`,
        GRAFANA_OTLP_ENDPOINT: `https://${leaked}.example/otlp`,
        GRAFANA_OTLP_INSTANCE_ID: leaked,
        GRAFANA_OTLP_TOKEN: leaked,
        TELEMETRY_TRACE_SAMPLE_RATIO: leaked,
        TELEMETRY_METRICS_ENABLED: leaked,
      },
      "development",
    );
    const everything = [
      JSON.stringify(summarizeTelemetryConfig(config)),
      JSON.stringify(config),
      inspect(config, { depth: null }),
    ].join("\n");
    expect(everything).not.toContain(leaked);
    expect(everything).not.toContain("LEAKED");
  });
});

describe("totality: telemetry settings can never stop the application", () => {
  const environments: AppEnvironment[] = [
    "development",
    "preview",
    "production",
  ];
  const junk = [
    "",
    " ",
    "\n",
    "\0",
    "null",
    "undefined",
    "NaN",
    "{}",
    "[]",
    "true",
    "false",
    "TRUE",
    "yes",
    "1",
    "0",
    "-1",
    "0.5",
    "1e999",
    "https://",
    "https://\u0000",
    "http://[::1",
    "javascript:alert(1)",
    "%",
    "\\",
    "💥".repeat(500),
    "x".repeat(100_000),
  ];

  function assertWellFormed(
    source: TelemetryEnvSource,
    appEnv: AppEnvironment,
  ) {
    const config = parse(source, appEnv);
    for (const entry of Object.values(summarizeTelemetryConfig(config))) {
      expect(["disabled", "blocked", "enabled"]).toContain(entry.state);
    }
    // The summary must always be serializable, whatever it was built from.
    expect(() =>
      JSON.stringify(summarizeTelemetryConfig(config)),
    ).not.toThrow();
  }

  it.each(junk.map((value) => [JSON.stringify(value).slice(0, 40), value]))(
    "yields a well-formed result with %s in every variable",
    (_label, value) => {
      const source = Object.fromEntries(
        TELEMETRY_SETTINGS.map((name) => [name, value as string]),
      );
      for (const appEnv of environments) assertWellFormed(source, appEnv);
    },
  );

  it("yields a well-formed result with junk in each variable alone, over a valid configuration", () => {
    for (const name of TELEMETRY_SETTINGS) {
      for (const value of junk) {
        for (const appEnv of environments) {
          assertWellFormed(
            { ...POSTHOG, ...GRAFANA_ALL, [name]: value },
            appEnv,
          );
        }
      }
    }
  });
});

describe("the list of settings", () => {
  it("is exactly what the parser reads", () => {
    // Every value is "true", in an environment that is not production, so the
    // parser takes every branch that reads a variable.
    const read = new Set<string>();
    const everythingOn = new Proxy<Record<string, string>>(
      {},
      {
        get(_target, name) {
          if (typeof name === "string") read.add(name);
          return "true";
        },
      },
    );
    parse(everythingOn, "development");
    parse(everythingOn, "production");
    expect([...read].sort()).toEqual([...TELEMETRY_SETTINGS].sort());
  });

  const envExample = readFileSync(
    path.resolve(import.meta.dirname, "..", ".env.example"),
    "utf8",
  );

  it.each(TELEMETRY_SETTINGS)("documents %s in .env.example", (name) => {
    // As a live assignment or a commented-out one — both document it.
    expect(envExample).toMatch(new RegExp(`^(?:#\\s*)?${name}=`, "m"));
  });
});
