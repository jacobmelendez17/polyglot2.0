import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ANALYTICS_EVENTS } from "@/domains/analytics/analytics-events";
import {
  DURATION_BUCKETS_MS,
  METRIC_NAMES,
} from "@/lib/observability/instruments";

import { OPERATIONAL_LINK_SETTINGS } from "./operational-links";
import { TELEMETRY_SETTINGS } from "./telemetry-config";

/**
 * Spec 27 Unit 27.11 — the runbook and the release gate say what the code does.
 *
 * `infra/telemetry/README.md` is what the owner follows to turn telemetry on,
 * and `infra/telemetry/release-gate.md` is the record spec 27 §15 asks for. A
 * runbook that names a setting that does not exist, omits one that does, lists
 * a metric the code never records or an event it never sends, is worse than no
 * runbook: the owner trusts it. These tests read both files as text and hold
 * them to the code, so a change to the settings, the metric catalog or the
 * event catalog cannot leave the documentation behind.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8");

const runbook = read("infra/telemetry/README.md");
const gate = read("infra/telemetry/release-gate.md");
const spec = read("context/feature-specs/27-analytics-observability.md");

/** The text of runbook section `## <number>. …`, up to the next `## ` heading. */
function section(number: number): string {
  const match = new RegExp(
    `^## ${number}\\. [^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
    "m",
  ).exec(runbook);
  if (!match) throw new Error(`runbook section ${number} not found`);
  return match[1]!;
}

/** The first cell of every table row that is a single backticked name matching `shape`. */
function tableNames(text: string, shape: RegExp): string[] {
  return [...text.matchAll(/^\| `([^`]+)` +\|/gm)]
    .map((match) => match[1]!)
    .filter((name) => shape.test(name));
}

/** Every backticked snake_case event-looking token in `text`. */
function eventNames(text: string): string[] {
  return [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(
    (match) => match[1]!,
  );
}

describe("the runbook's settings (section 5)", () => {
  it("documents every telemetry and link setting the code reads, and no setting it does not", () => {
    const documented = tableNames(section(5), /^[A-Z][A-Z0-9_]+$/);

    expect([...documented].sort()).toEqual(
      [...TELEMETRY_SETTINGS, ...OPERATIONAL_LINK_SETTINGS].sort(),
    );
  });

  it("documents each setting once", () => {
    const documented = tableNames(section(5), /^[A-Z][A-Z0-9_]+$/);

    expect(new Set(documented).size).toBe(documented.length);
  });
});

describe("the runbook's PostHog section (section 11)", () => {
  const events = Object.entries(ANALYTICS_EVENTS);
  const sent = events
    .filter(([, event]) => event.emitted)
    .map(([name]) => name);
  const notSent = events
    .filter(([, event]) => !event.emitted)
    .map(([name]) => name);

  it("names exactly the events the code sends, in the sentence that lists them", () => {
    const sentence = /The events are ([^.]*)\./.exec(section(11))?.[1];

    expect(sentence, "the sentence 'The events are …'").toBeDefined();
    expect(eventNames(sentence!).sort()).toEqual([...sent].sort());
  });

  it("names exactly the approved events it cannot send yet, and says why", () => {
    const paragraph = /\*\*\w+ approved events are not sent[^\n]*/.exec(
      section(11),
    )?.[0];

    expect(paragraph, "the paragraph about unsent events").toBeDefined();
    expect(eventNames(paragraph!).sort()).toEqual([...notSent].sort());
  });

  it("says how many events are not sent, in words, and the number is right", () => {
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];

    expect(section(11)).toContain(`**${words[notSent.length]} approved events`);
  });
});

describe("the runbook's Grafana section (section 12)", () => {
  it("lists exactly the metrics the catalog records", () => {
    const documented = tableNames(section(12), /^[a-z]+(?:_[a-z]+)+$/).filter(
      (name) => /_(total|ms)$/.test(name),
    );

    expect([...documented].sort()).toEqual(Object.values(METRIC_NAMES).sort());
  });

  it("states the histogram bucket boundaries the code uses", () => {
    const boundaries = [...DURATION_BUCKETS_MS];
    const last = boundaries.pop();
    const sentence = `${boundaries.join(", ")} and ${last} ms`;

    expect(section(12)).toContain(sentence);
  });

  it("states how many series one label set of a histogram costs, and it is the right number", () => {
    // One series per bucket boundary, one for +Inf, one for the sum, one for the count.
    const perHistogram = DURATION_BUCKETS_MS.length + 3;

    expect(section(12)).toContain(`${perHistogram} series per label set`);
  });
});

/** The text of release-gate section `## <number>. …`, up to the next `## ` heading. */
function gateSection(number: number): string {
  const match = new RegExp(
    `^## ${number}\\. [^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
    "m",
  ).exec(gate);
  if (!match) throw new Error(`release-gate section ${number} not found`);
  return match[1]!;
}

/** The numbered rows of a table: the number, the first text cell and the second (the status). */
function numberedRows(text: string) {
  return [...text.matchAll(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/gm)].map(
    (match) => ({
      number: Number(match[1]),
      first: match[2]!,
      status: match[3]!.replace(/\*\*/g, "").trim(),
    }),
  );
}

/** The first column of a spec table, in order, without its header. */
function specTable(heading: RegExp, header: string): string[] {
  const text = heading.exec(spec)?.[1] ?? "";
  return [...text.matchAll(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/gm)]
    .map((match) => match[1]!)
    .filter((cell) => cell !== header && !/^[-: ]+$/.test(cell));
}

describe("the release gate (spec 27 §15)", () => {
  const STATUS = /^(PASS|BLOCKED|NOT VERIFIED)\b/;

  /** The checklist items of spec 27 §15, in order, without the checkbox. */
  const required = [
    ...(
      /## 15\. Final zero-charge release gate([\s\S]*?)\n## 16\./.exec(
        spec,
      )?.[1] ?? ""
    ).matchAll(/^- \[ \] (.+)$/gm),
  ].map((match) => match[1]!);

  const rows = numberedRows(gateSection(1));

  it("is the checklist in the spec, every item, in the spec's order and words", () => {
    expect(required.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.first)).toEqual(required);
  });

  it("numbers its rows from 1 without a gap", () => {
    expect(rows.map((row) => row.number)).toEqual(
      rows.map((_, index) => index + 1),
    );
  });

  it("records every item as PASS, BLOCKED or NOT VERIFIED, and nothing else", () => {
    for (const row of rows) {
      expect(row.status, `item ${row.number}`).toMatch(STATUS);
    }
  });

  it("never records an item that needs a provider account as PASS for the account itself", () => {
    // Items 1, 2, 4 and 6 are about the owner's accounts and the provider's own
    // usage pages. Nothing in the repository can establish them, so they may not
    // read as plain PASS.
    for (const number of [1, 2, 4, 6]) {
      const row = rows.find((candidate) => candidate.number === number);
      expect(row?.status, `item ${number}`).not.toMatch(/^PASS\b/);
    }
  });

  it("leaves no placeholder behind", () => {
    expect(gate).not.toMatch(/⟦|\{\{/);
  });
});

describe("the acceptance matrix in the release gate (spec 27 §14)", () => {
  const STATUS = /^(Automated|Needs your account|Not built yet)\b/;
  const scenarios = specTable(
    /## 14\. Required acceptance and adversarial test matrix([\s\S]*?)\n## 15\./,
    "Scenario",
  );
  const rows = numberedRows(gateSection(4));

  it("has every scenario of the spec, in the spec's order and words", () => {
    expect(scenarios.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.first)).toEqual(scenarios);
  });

  it("numbers its rows from 1 without a gap", () => {
    expect(rows.map((row) => row.number)).toEqual(
      rows.map((_, index) => index + 1),
    );
  });

  it("says for every scenario whether it is automated, needs your account, or is not built yet", () => {
    for (const row of rows) {
      expect(row.status, `scenario ${row.number}`).toMatch(STATUS);
    }
  });
});
