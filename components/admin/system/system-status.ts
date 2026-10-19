import type {
  TelemetryIssue,
  TelemetryStatus,
  TelemetryStatusEntry,
} from "@/lib/telemetry-config";

/**
 * Spec 27 Unit 27.10 — what the Admin System tab says about telemetry, as plain
 * data, built from the sanitized summary (`summarizeTelemetryConfig`) and
 * nothing else.
 *
 * That summary holds states and issue codes — no endpoint, instance id, token or
 * project key — so this view cannot show a value however it is written: it has
 * none to show. Every sentence is a fixed string around a setting _name_.
 *
 * The explanations are honest about their limit. They describe how _this
 * server_ is set up; they cannot say whether PostHog or Grafana is receiving
 * anything, whether an allowance has been used up, or whether an alert would
 * fire, and spec 27 forbids inventing an in-app meter that claims to
 * (§11.2 "Quota Watch"). The panel says so, and points at the vendors' own pages.
 */

export type SignalId = "analytics" | "metrics" | "traces" | "logs";
export type SignalState = "on" | "off" | "blocked";

export type SignalReason = {
  /** The environment variable, by name. */
  setting: string;
  /** What is wrong with it, to read after the name. Never contains a value. */
  message: string;
};

export type SignalRow = {
  id: SignalId;
  title: string;
  vendor: string;
  /** The switch that turns it on, by name. */
  switchName: string;
  state: SignalState;
  stateLabel: "On" | "Off" | "Blocked";
  summary: string;
  /** Why a blocked signal is blocked; empty otherwise. */
  reasons: SignalReason[];
};

const STATE_OF: Record<TelemetryStatusEntry["state"], SignalState> = {
  enabled: "on",
  disabled: "off",
  blocked: "blocked",
};

const STATE_LABEL: Record<SignalState, SignalRow["stateLabel"]> = {
  on: "On",
  off: "Off",
  blocked: "Blocked",
};

type Definition = {
  title: string;
  vendor: string;
  switchName: string;
  on: (context: { traceSampleRatio: number | null }) => string;
  off: string;
};

/** "5%", "0.5%", "100%": the share of requests, without a false precision. */
export function formatSamplePercent(ratio: number): string {
  const percent = Math.round(ratio * 1000) / 10;
  return `${percent}%`;
}

const DEFINITIONS: Record<SignalId, Definition> = {
  analytics: {
    title: "Product analytics",
    vendor: "PostHog",
    switchName: "POSTHOG_ENABLED",
    on: () =>
      "Sending anonymous product events to PostHog — only for learners who have turned analytics on in Settings → Privacy. Nobody else is recorded.",
    off: "Not sending anything. It stays off until this switch is true, and even then only learners who opt in are recorded.",
  },
  metrics: {
    title: "Metrics",
    vendor: "Grafana Cloud",
    switchName: "TELEMETRY_METRICS_ENABLED",
    on: () =>
      "Sending request counts and timings, and review and lesson outcomes, to Grafana Cloud.",
    off: "Not sending metrics.",
  },
  traces: {
    title: "Traces",
    vendor: "Grafana Cloud",
    switchName: "TELEMETRY_TRACES_ENABLED",
    on: ({ traceSampleRatio }) => {
      if (traceSampleRatio === null) {
        return "Sending a sample of requests to Grafana Cloud as traces (the method, the page and timings only).";
      }
      if (traceSampleRatio === 0) {
        return "Switched on, but the sampling share is 0%, so no traces are sent.";
      }
      return `Sending about ${formatSamplePercent(traceSampleRatio)} of requests to Grafana Cloud as traces (the method, the page and timings only).`;
    },
    off: "Not sending traces.",
  },
  logs: {
    title: "Logs",
    vendor: "Grafana Cloud",
    switchName: "TELEMETRY_LOGS_ENABLED",
    on: () =>
      "Sending warnings and errors to Grafana Cloud, reduced to a fixed set of safe fields — never messages or anything a learner typed.",
    off: "Not sending logs.",
  },
};

const ORDER: readonly SignalId[] = ["analytics", "metrics", "traces", "logs"];

/** A setting's problem in words, from its code alone. */
export function describeIssue(issue: TelemetryIssue): SignalReason {
  switch (issue.code) {
    case "plan_not_confirmed":
      return {
        setting: issue.setting,
        message:
          "isn't “true”. Confirm the account is on the Free plan, with no card, first.",
      };
    case "missing_setting":
      return { setting: issue.setting, message: "isn't set." };
    case "invalid_setting":
      return {
        setting: issue.setting,
        message: "has a value that isn't accepted.",
      };
    case "non_production_not_allowed":
      return {
        setting: issue.setting,
        message:
          "isn't “true”, and this isn't production, so nothing is sent from here.",
      };
  }
}

export function buildSignalRows(
  status: TelemetryStatus,
  options: { traceSampleRatio: number | null },
): SignalRow[] {
  return ORDER.map((id) => {
    const definition = DEFINITIONS[id];
    const entry = status[id];
    const state = STATE_OF[entry.state];
    const summary =
      state === "on"
        ? definition.on(options)
        : state === "blocked"
          ? "Switched on, but blocked: it behaves as off until the problems below are fixed."
          : definition.off;
    return {
      id,
      title: definition.title,
      vendor: definition.vendor,
      switchName: definition.switchName,
      state,
      stateLabel: STATE_LABEL[state],
      summary,
      reasons: state === "blocked" ? entry.issues.map(describeIssue) : [],
    };
  });
}
