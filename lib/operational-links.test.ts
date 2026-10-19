import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_LINK_SETTINGS,
  parseOperationalLinks,
} from "./operational-links";

const grafana = (value: string) =>
  parseOperationalLinks({ GRAFANA_STACK_URL: value });
const posthog = (value: string) =>
  parseOperationalLinks({ POSTHOG_DASHBOARDS_URL: value });

describe("nothing set", () => {
  it("has no links and rejects nothing", () => {
    expect(parseOperationalLinks({})).toEqual({
      grafana: null,
      posthog: null,
      rejected: [],
    });
  });

  it.each(["", "   ", "\n", "\t "])(
    "treats a blank value (%j) as not set, not as a mistake",
    (value) => {
      expect(grafana(value)).toEqual({
        grafana: null,
        posthog: null,
        rejected: [],
      });
      expect(posthog(value).rejected).toEqual([]);
    },
  );
});

describe("GRAFANA_STACK_URL", () => {
  it.each([
    "https://mystack.grafana.net",
    "https://mystack.grafana.net/",
    "  https://mystack.grafana.net  ",
    "https://MyStack.Grafana.NET",
    "https://my-stack-2.grafana.net",
  ])("accepts %j and derives the stack's own pages from it", (value) => {
    const { grafana: result, rejected } = grafana(value);

    expect(rejected).toEqual([]);
    expect(result?.stack).toMatch(/^https:\/\/[a-z0-9-]+\.grafana\.net$/);
    const stack = result!.stack;
    expect(result!.links).toEqual([
      { label: "Dashboards", url: `${stack}/dashboards` },
      { label: "Alert rules", url: `${stack}/alerting/list` },
      {
        label: "Email contact points",
        url: `${stack}/alerting/notifications`,
      },
      { label: "Explore metrics, traces and logs", url: `${stack}/explore` },
      {
        label: "Uptime check (Synthetic Monitoring)",
        url: `${stack}/a/grafana-synthetic-monitoring-app/home`,
      },
    ]);
  });

  it("builds every link from the stack's own origin, never from anything else in the value", () => {
    const { grafana: result } = grafana("https://mystack.grafana.net/");

    for (const link of result!.links) {
      expect(link.url.startsWith("https://mystack.grafana.net/")).toBe(true);
    }
  });

  it.each([
    ["plain http", "http://mystack.grafana.net"],
    ["no scheme", "mystack.grafana.net"],
    ["a protocol-relative address", "//mystack.grafana.net"],
    ["a script", "javascript:alert(1)"],
    ["a data address", "data:text/html,<script>alert(1)</script>"],
    ["the bare domain", "https://grafana.net"],
    ["an empty stack name", "https://.grafana.net"],
    ["two labels before the domain", "https://a.b.grafana.net"],
    ["a suffix trick", "https://mystack.grafana.net.evil.example"],
    ["a prefix trick", "https://evil.example/mystack.grafana.net"],
    ["a look-alike domain", "https://mystack-grafana.net"],
    ["another top-level domain", "https://mystack.grafana.com"],
    ["a host that merely ends the same way", "https://grafana.net.evil.com"],
    ["an internationalised name", "https://mystаck.grafana.net"],
    ["an IPv4 host", "https://127.0.0.1"],
    ["an IPv6 host", "https://[::1]"],
    ["credentials in the address", "https://user:secret@mystack.grafana.net"],
    ["a username alone", "https://user@mystack.grafana.net"],
    ["a port", "https://mystack.grafana.net:8443"],
    ["a query string", "https://mystack.grafana.net/?token=abc"],
    ["a fragment", "https://mystack.grafana.net/#section"],
    ["a path other than the root", "https://mystack.grafana.net/dashboards"],
    ["the OTLP path pasted by mistake", "https://mystack.grafana.net/otlp"],
    ["a newline inside the address", "https://my\nstack.grafana.net"],
    ["a tab inside the address", "https://mystack.\tgrafana.net"],
    ["a space inside the address", "https://mystack .grafana.net"],
    ["a control character", "https://mystack.grafana.net\u0000"],
  ])("rejects %s", (_label, value) => {
    expect(grafana(value)).toEqual({
      grafana: null,
      posthog: null,
      rejected: ["GRAFANA_STACK_URL"],
    });
  });

  it("never lets a rejected value into the result", () => {
    const secret = "glc_AbCdEfGhIjKlMnOpQrStUv";
    const result = grafana(`https://user:${secret}@mystack.grafana.net`);

    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("mystack");
  });
});

describe("POSTHOG_DASHBOARDS_URL", () => {
  it.each([
    ["https://us.posthog.com", "https://us.posthog.com"],
    ["https://us.posthog.com/", "https://us.posthog.com"],
    ["https://eu.posthog.com/", "https://eu.posthog.com"],
    ["https://app.posthog.com", "https://app.posthog.com"],
    [
      "https://us.posthog.com/project/12345/dashboard",
      "https://us.posthog.com/project/12345/dashboard",
    ],
    [
      "https://eu.posthog.com/project/12345/dashboard/678/",
      "https://eu.posthog.com/project/12345/dashboard/678",
    ],
    [
      "  https://us.posthog.com/project/1  ",
      "https://us.posthog.com/project/1",
    ],
  ])("accepts %j as %j", (value, dashboards) => {
    const result = posthog(value);

    expect(result.rejected).toEqual([]);
    expect(result.posthog?.dashboards).toBe(dashboards);
  });

  it("offers the dashboards and, from the same host, the billing and usage page", () => {
    const { posthog: result } = posthog(
      "https://eu.posthog.com/project/12345/dashboard",
    );

    expect(result!.links).toEqual([
      {
        label: "Dashboards",
        url: "https://eu.posthog.com/project/12345/dashboard",
      },
      {
        label: "Billing and usage",
        url: "https://eu.posthog.com/organization/billing",
      },
    ]);
  });

  it.each([
    ["plain http", "http://us.posthog.com"],
    ["no scheme", "us.posthog.com"],
    ["a script", "javascript:alert(1)"],
    ["the bare domain", "https://posthog.com"],
    ["the ingestion host, which is not the app", "https://us.i.posthog.com"],
    ["the EU ingestion host", "https://eu.i.posthog.com"],
    ["another subdomain", "https://evil.posthog.com"],
    ["a suffix trick", "https://us.posthog.com.evil.example"],
    ["a prefix trick", "https://evil.example/us.posthog.com"],
    ["a look-alike", "https://us-posthog.com"],
    ["a self-hosted address", "https://analytics.example.org"],
    ["credentials", "https://user:secret@us.posthog.com"],
    ["a port", "https://us.posthog.com:8000"],
    ["a query string", "https://us.posthog.com/project/1?token=abc"],
    ["a fragment", "https://us.posthog.com/project/1#x"],
    [
      "a shared dashboard, whose link is its password",
      "https://us.posthog.com/shared/AbC123",
    ],
    ["an embedded dashboard", "https://us.posthog.com/embedded/AbC123"],
    ["an exported insight", "https://us.posthog.com/exporter/AbC123"],
    [
      "a shared route further down",
      "https://us.posthog.com/project/1/shared/AbC123",
    ],
    ["an encoded character", "https://us.posthog.com/project/12%2F34"],
    ["a space", "https://us.posthog.com/project/12 34"],
    ["a doubled slash", "https://us.posthog.com/project//1"],
    ["a dot", "https://us.posthog.com/project/1.5"],
    ["an enormous path", `https://us.posthog.com/${"a".repeat(300)}`],
    ["a newline", "https://us.posthog.com/pro\nject/1"],
  ])("rejects %s", (_label, value) => {
    expect(posthog(value)).toEqual({
      grafana: null,
      posthog: null,
      rejected: ["POSTHOG_DASHBOARDS_URL"],
    });
  });

  it("collapses dot segments before judging a path, so they cannot smuggle a token route in", () => {
    // `/project/1/../shared/x` is `/project/shared/x` once the address is parsed.
    expect(
      posthog("https://us.posthog.com/project/1/../shared/x").rejected,
    ).toEqual(["POSTHOG_DASHBOARDS_URL"]);
  });
});

describe("both settings", () => {
  it("are judged independently", () => {
    const result = parseOperationalLinks({
      GRAFANA_STACK_URL: "https://mystack.grafana.net",
      POSTHOG_DASHBOARDS_URL: "https://us.posthog.com/shared/token",
    });

    expect(result.grafana).not.toBeNull();
    expect(result.posthog).toBeNull();
    expect(result.rejected).toEqual(["POSTHOG_DASHBOARDS_URL"]);
  });

  it("reports each rejection once, by name", () => {
    const result = parseOperationalLinks({
      GRAFANA_STACK_URL: "http://nope",
      POSTHOG_DASHBOARDS_URL: "http://nope",
    });

    expect(result.rejected).toEqual([
      "GRAFANA_STACK_URL",
      "POSTHOG_DASHBOARDS_URL",
    ]);
  });

  it("is total: no input, however strange, makes it throw", () => {
    for (const value of [
      "\u0000".repeat(10),
      "https://" + "a".repeat(100_000),
      "💥",
      "https://[",
      "https://%",
      "null",
      "[object Object]",
    ]) {
      expect(() =>
        parseOperationalLinks({
          GRAFANA_STACK_URL: value,
          POSTHOG_DASHBOARDS_URL: value,
        }),
      ).not.toThrow();
    }
  });

  it("reads only its own two variables", () => {
    const read: string[] = [];
    const source = new Proxy(
      {},
      {
        get(_target, name) {
          if (typeof name === "string") read.push(name);
          return undefined;
        },
      },
    );

    parseOperationalLinks(source);

    expect(read.sort()).toEqual([...OPERATIONAL_LINK_SETTINGS].sort());
  });
});

describe("the E2E server's link settings", () => {
  // scripts/e2e-server.ts starts a server and cannot be imported to test, so the
  // file is read as text (the same approach lib/env.test.ts takes for its
  // telemetry switches). A value the parser would refuse would silently turn the
  // E2E "configured" tests into no-link tests; this keeps them honest.
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, "..", "scripts/e2e-server.ts"),
    "utf8",
  );
  const valueOf = (name: string) =>
    new RegExp(`${name}:\\s*"([^"]+)"`).exec(source)?.[1];

  it.each(OPERATIONAL_LINK_SETTINGS)("sets %s", (name) => {
    expect(valueOf(name)).toBeTruthy();
  });

  it("sets values the parser accepts", () => {
    const result = parseOperationalLinks({
      GRAFANA_STACK_URL: valueOf("GRAFANA_STACK_URL"),
      POSTHOG_DASHBOARDS_URL: valueOf("POSTHOG_DASHBOARDS_URL"),
    });

    expect(result.rejected).toEqual([]);
    expect(result.grafana).not.toBeNull();
    expect(result.posthog).not.toBeNull();
  });
});

describe(".env.example", () => {
  const example = fs.readFileSync(
    path.resolve(import.meta.dirname, "..", ".env.example"),
    "utf8",
  );

  it.each(OPERATIONAL_LINK_SETTINGS)("documents %s", (name) => {
    expect(example).toMatch(new RegExp(`^${name}=`, "m"));
  });

  it("ships both links empty, so a fresh checkout shows no external links", () => {
    for (const name of OPERATIONAL_LINK_SETTINGS) {
      expect(example).toMatch(new RegExp(`^${name}=\\s*$`, "m"));
    }
  });
});
