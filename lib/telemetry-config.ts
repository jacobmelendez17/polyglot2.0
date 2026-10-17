import { z } from "zod";

/**
 * Spec 27 Unit 27.1 — the typed contract for the optional product-analytics
 * (PostHog) and observability (Grafana Cloud over OTLP) settings.
 *
 * This is deliberately NOT part of `lib/env.ts`'s `envSchema`. That schema
 * throws on a bad value and refuses to boot, which is right for settings the
 * application cannot run without and wrong for telemetry: spec 27 §4 makes
 * "enabled with missing or invalid credentials" disable that one provider and
 * report why, never take the application down. `parseTelemetryConfig` is
 * therefore total — it returns a value for any input and never throws.
 *
 * The rules, applied to each provider or signal:
 *
 * 1. Default deny. A provider is `disabled` unless its enable flag is "true".
 *    A disabled provider's other settings are not even read, so junk left in
 *    them can neither raise an error nor cause a connection.
 * 2. Fail closed. A provider whose flag is on but which cannot run safely is
 *    `blocked`, and a blocked provider behaves exactly like a disabled one.
 *    Four things block it: a missing or malformed setting, a $0 plan gate the
 *    owner has not confirmed (spec 27 §3.2 and §15), and a non-production
 *    `APP_ENV` without the explicit non-production allowance.
 * 3. Diagnostics name the setting and the kind of problem. They never carry
 *    the offending value, because a secret typed into the wrong variable is
 *    the commonest way a value ends up somewhere it should not.
 *
 * Nothing here reads `process.env` or touches the network — the caller passes
 * the environment in — so every rule is unit-testable with a plain object.
 */

export type AppEnvironment = "development" | "preview" | "production";

/** A credential that cannot be logged or serialized by accident. */
export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** The one deliberate way to read it. Call sites should be few, and obvious in review. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return "[REDACTED]";
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "[REDACTED]";
  }
}

export type TelemetryIssueCode =
  /** A setting the enabled provider needs is unset or blank. */
  | "missing_setting"
  /** A setting is set but malformed, of the wrong kind, or points somewhere not allowed. */
  | "invalid_setting"
  /** The owner has not confirmed the provider account is on the $0 Free plan with no card. */
  | "plan_not_confirmed"
  /** `APP_ENV` is not production and non-production telemetry was not explicitly allowed. */
  | "non_production_not_allowed";

/** Names a setting and says what is wrong with it. Never contains a value. */
export type TelemetryIssue = {
  readonly code: TelemetryIssueCode;
  readonly setting: string;
};

export type ProviderState<Active extends object = object> =
  | { readonly state: "disabled" }
  | { readonly state: "blocked"; readonly issues: readonly TelemetryIssue[] }
  | ({ readonly state: "enabled" } & Active);

export type PostHogConnection = {
  /** The PostHog Cloud ingestion origin, e.g. https://us.i.posthog.com */
  readonly host: string;
  /** The public project token (`phc_…`). Never a personal API key. */
  readonly projectToken: SecretValue;
};

export type OtlpConnection = {
  /** The Grafana Cloud OTLP base endpoint, e.g. https://otlp-gateway-prod-us-east-0.grafana.net/otlp */
  readonly endpoint: string;
  /** The numeric stack instance id, used as the Basic-auth user name. */
  readonly instanceId: string;
  /** A Cloud Access Policy token (`glc_…`) holding the three `*:write` scopes and nothing else. */
  readonly token: SecretValue;
};

export type TelemetryConfig = {
  readonly analytics: ProviderState<PostHogConnection>;
  readonly observability: {
    readonly metrics: ProviderState<{ connection: OtlpConnection }>;
    readonly traces: ProviderState<{
      connection: OtlpConnection;
      /** Head-sampling probability for ordinary requests, 0 to 1. */
      sampleRatio: number;
    }>;
    readonly logs: ProviderState<{ connection: OtlpConnection }>;
  };
};

/** The environment a caller hands in — `process.env` in the application, a plain object in a test. */
export type TelemetryEnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Every variable that switches telemetry on or loosens a guard on it. Test
 * environments (Vitest, the E2E server) force each of these to "false", so
 * telemetry is off whatever a developer's `.env.local` says (spec 27 §13.1).
 * Listing a switch here is what puts it under that protection, so a new one
 * cannot be forgotten.
 */
export const TELEMETRY_SWITCHES = [
  "POSTHOG_ENABLED",
  "TELEMETRY_METRICS_ENABLED",
  "TELEMETRY_TRACES_ENABLED",
  "TELEMETRY_LOGS_ENABLED",
  "TELEMETRY_ALLOW_NON_PRODUCTION",
] as const;

/**
 * Every variable this module reads — the switches above, the two $0 plan
 * confirmations, and the credentials. Tests hold this list to the parser (a
 * variable the parser reads that is not here fails), to `.env.example` (every
 * entry must be documented there, per code-standards.md's "adding a variable
 * means updating `.env.example`"), and to `TELEMETRY_SWITCHES` (an on-switch
 * missing from it fails).
 */
export const TELEMETRY_SETTINGS = [
  ...TELEMETRY_SWITCHES,
  "POSTHOG_FREE_PLAN_CONFIRMED",
  "POSTHOG_PROJECT_TOKEN",
  "POSTHOG_HOST",
  "GRAFANA_FREE_PLAN_CONFIRMED",
  "GRAFANA_OTLP_ENDPOINT",
  "GRAFANA_OTLP_INSTANCE_ID",
  "GRAFANA_OTLP_TOKEN",
  "TELEMETRY_TRACE_SAMPLE_RATIO",
] as const;

/** Spec 27 §3.3: 5% head sampling for ordinary requests, configurable down to 0. */
export const DEFAULT_TRACE_SAMPLE_RATIO = 0.05;

/**
 * PostHog Cloud's two ingestion hosts (https://posthog.com/docs/libraries/node).
 * An allowlist rather than "any https URL": learner product events must go to
 * the region the owner chose and nowhere else, so a typo blocks the provider
 * instead of sending events to a stranger.
 */
const POSTHOG_INGESTION_HOSTS: ReadonlySet<string> = new Set([
  "us.i.posthog.com",
  "eu.i.posthog.com",
]);

const GRAFANA_HOST_SUFFIX = ".grafana.net";
const GRAFANA_OTLP_BASE_PATH = "/otlp";

/**
 * A URL that will carry credentials must be https with no embedded
 * credentials, query, fragment or non-default port. Anything else is null, so
 * the caller reports one `invalid_setting`.
 */
function parseCleanHttpsUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const clean =
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.port === "";
  return clean ? url : null;
}

// `phc_` is PostHog's public project token. A personal API key (`phx_`) or a
// secure feature-flag key (`phs_`) is private and must never be wired in
// here, so the prefix check also refuses the wrong kind of credential.
const postHogProjectTokenSchema = z
  .string()
  .regex(/^phc_[A-Za-z0-9_-]{16,200}$/);

const postHogHostSchema = z.string().transform((raw, ctx) => {
  const url = parseCleanHttpsUrl(raw);
  if (
    !url ||
    url.pathname.replace(/\/+$/, "") !== "" ||
    !POSTHOG_INGESTION_HOSTS.has(url.hostname)
  ) {
    ctx.addIssue({ code: "custom", message: "not a PostHog ingestion host" });
    return z.NEVER;
  }
  return url.origin;
});

// The base URL, not a per-signal one: the OTLP exporters append /v1/metrics,
// /v1/traces and /v1/logs themselves.
const grafanaEndpointSchema = z.string().transform((raw, ctx) => {
  const url = parseCleanHttpsUrl(raw);
  if (
    !url ||
    url.pathname.replace(/\/+$/, "") !== GRAFANA_OTLP_BASE_PATH ||
    !url.hostname.endsWith(GRAFANA_HOST_SUFFIX)
  ) {
    ctx.addIssue({ code: "custom", message: "not a Grafana OTLP base URL" });
    return z.NEVER;
  }
  return `${url.origin}${GRAFANA_OTLP_BASE_PATH}`;
});

const grafanaInstanceIdSchema = z.string().regex(/^[0-9]{1,15}$/);

// `glc_` is a Grafana Cloud Access Policy token — the kind the OTLP gateway
// takes. A service-account token (`glsa_`) is the wrong credential and is
// refused rather than tried.
const grafanaTokenSchema = z.string().regex(/^glc_[A-Za-z0-9+/=_-]{20,}$/);

// A plain decimal from 0 to 1. Not "1e-2" or "0x1", which Number() accepts.
const sampleRatioSchema = z
  .string()
  .regex(/^(?:0|1|1\.0+|0?\.[0-9]+)$/)
  .transform(Number);

type FlagValue = "on" | "off" | "invalid";

/**
 * "true" (any case) turns something on; "false", unset and blank are off.
 * Anything else ("yes", "1") is `invalid` rather than guessed at: a typo in a
 * switch that gates outbound traffic is reported, and the provider stays off.
 */
function readFlag(value: string | undefined): FlagValue {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "false") return "off";
  return normalized === "true" ? "on" : "invalid";
}

type Setting<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: TelemetryIssue };

function readSetting<T>(
  source: TelemetryEnvSource,
  name: string,
  schema: z.ZodType<T, string>,
): Setting<T> {
  const raw = source[name]?.trim();
  if (!raw) {
    return { ok: false, issue: { code: "missing_setting", setting: name } };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issue: { code: "invalid_setting", setting: name } };
}

function issueOf(setting: Setting<unknown>): TelemetryIssue[] {
  return setting.ok ? [] : [setting.issue];
}

function invalidFlagIssue(name: string, flag: FlagValue): TelemetryIssue[] {
  return flag === "invalid" ? [{ code: "invalid_setting", setting: name }] : [];
}

/** The two gates that apply to every provider: the $0 plan confirmation, and the environment. */
function gateIssues(
  source: TelemetryEnvSource,
  appEnv: AppEnvironment,
  planConfirmedSetting: string,
): TelemetryIssue[] {
  const issues: TelemetryIssue[] = [];
  if (readFlag(source[planConfirmedSetting]) !== "on") {
    issues.push({ code: "plan_not_confirmed", setting: planConfirmedSetting });
  }
  if (
    appEnv !== "production" &&
    readFlag(source.TELEMETRY_ALLOW_NON_PRODUCTION) !== "on"
  ) {
    issues.push({
      code: "non_production_not_allowed",
      setting: "TELEMETRY_ALLOW_NON_PRODUCTION",
    });
  }
  return issues;
}

function parseAnalytics(
  source: TelemetryEnvSource,
  appEnv: AppEnvironment,
): TelemetryConfig["analytics"] {
  const flag = readFlag(source.POSTHOG_ENABLED);
  if (flag === "off") return { state: "disabled" };

  const token = readSetting(
    source,
    "POSTHOG_PROJECT_TOKEN",
    postHogProjectTokenSchema,
  );
  const host = readSetting(source, "POSTHOG_HOST", postHogHostSchema);

  const issues = [
    ...invalidFlagIssue("POSTHOG_ENABLED", flag),
    ...gateIssues(source, appEnv, "POSTHOG_FREE_PLAN_CONFIRMED"),
    ...issueOf(token),
    ...issueOf(host),
  ];
  if (issues.length === 0 && token.ok && host.ok) {
    return {
      state: "enabled",
      host: host.value,
      projectToken: new SecretValue(token.value),
    };
  }
  return { state: "blocked", issues };
}

function parseObservability(
  source: TelemetryEnvSource,
  appEnv: AppEnvironment,
): TelemetryConfig["observability"] {
  const metricsFlag = readFlag(source.TELEMETRY_METRICS_ENABLED);
  const tracesFlag = readFlag(source.TELEMETRY_TRACES_ENABLED);
  const logsFlag = readFlag(source.TELEMETRY_LOGS_ENABLED);

  if ([metricsFlag, tracesFlag, logsFlag].every((flag) => flag === "off")) {
    return {
      metrics: { state: "disabled" },
      traces: { state: "disabled" },
      logs: { state: "disabled" },
    };
  }

  // The three signals share one Grafana stack, so its connection and the
  // gates are judged once and apply to whichever signals were asked for.
  const endpoint = readSetting(
    source,
    "GRAFANA_OTLP_ENDPOINT",
    grafanaEndpointSchema,
  );
  const instanceId = readSetting(
    source,
    "GRAFANA_OTLP_INSTANCE_ID",
    grafanaInstanceIdSchema,
  );
  const token = readSetting(source, "GRAFANA_OTLP_TOKEN", grafanaTokenSchema);
  const sharedIssues = [
    ...gateIssues(source, appEnv, "GRAFANA_FREE_PLAN_CONFIRMED"),
    ...issueOf(endpoint),
    ...issueOf(instanceId),
    ...issueOf(token),
  ];
  const connection: OtlpConnection | null =
    endpoint.ok && instanceId.ok && token.ok
      ? {
          endpoint: endpoint.value,
          instanceId: instanceId.value,
          token: new SecretValue(token.value),
        }
      : null;

  // Only the traces signal has a sampling ratio, so only it is blocked by a bad one.
  const hasRatio = Boolean(source.TELEMETRY_TRACE_SAMPLE_RATIO?.trim());
  const ratio = hasRatio
    ? readSetting(source, "TELEMETRY_TRACE_SAMPLE_RATIO", sampleRatioSchema)
    : ({ ok: true, value: DEFAULT_TRACE_SAMPLE_RATIO } as const);

  const resolve = <Active extends object>(
    flagName: string,
    flag: FlagValue,
    extraIssues: readonly TelemetryIssue[],
    activate: (connection: OtlpConnection) => Active,
  ): ProviderState<{ connection: OtlpConnection } & Active> => {
    if (flag === "off") return { state: "disabled" };
    const issues = [
      ...invalidFlagIssue(flagName, flag),
      ...sharedIssues,
      ...extraIssues,
    ];
    if (issues.length > 0 || !connection) return { state: "blocked", issues };
    return { state: "enabled", connection, ...activate(connection) };
  };

  return {
    metrics: resolve("TELEMETRY_METRICS_ENABLED", metricsFlag, [], () => ({})),
    traces: resolve(
      "TELEMETRY_TRACES_ENABLED",
      tracesFlag,
      issueOf(ratio),
      () => ({
        sampleRatio: ratio.ok ? ratio.value : DEFAULT_TRACE_SAMPLE_RATIO,
      }),
    ),
    logs: resolve("TELEMETRY_LOGS_ENABLED", logsFlag, [], () => ({})),
  };
}

/**
 * Resolves the telemetry settings in `source` for `appEnv`. Total: any input,
 * including garbage in every variable, yields a value and never throws.
 */
export function parseTelemetryConfig(
  source: TelemetryEnvSource,
  appEnv: AppEnvironment,
): TelemetryConfig {
  return {
    analytics: parseAnalytics(source, appEnv),
    observability: parseObservability(source, appEnv),
  };
}

export type TelemetryStatusEntry = {
  readonly state: "disabled" | "blocked" | "enabled";
  readonly issues: readonly TelemetryIssue[];
};

export type TelemetryStatus = {
  readonly analytics: TelemetryStatusEntry;
  readonly metrics: TelemetryStatusEntry;
  readonly traces: TelemetryStatusEntry;
  readonly logs: TelemetryStatusEntry;
};

function statusOf(config: ProviderState): TelemetryStatusEntry {
  return {
    state: config.state,
    issues: config.state === "blocked" ? config.issues : [],
  };
}

/**
 * A view of the configuration that is safe to log, return from an endpoint or
 * show on the admin System tab: states and issue codes only — no endpoint, no
 * instance id, no token. Unit 27.10's status explanations build on this.
 */
export function summarizeTelemetryConfig(
  config: TelemetryConfig,
): TelemetryStatus {
  return {
    analytics: statusOf(config.analytics),
    metrics: statusOf(config.observability.metrics),
    traces: statusOf(config.observability.traces),
    logs: statusOf(config.observability.logs),
  };
}
