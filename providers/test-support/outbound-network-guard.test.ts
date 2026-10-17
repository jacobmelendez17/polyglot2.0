import http from "node:http";
import https from "node:https";
import net from "node:net";

import { describe, expect, it } from "vitest";

import { recordOutboundAttempts } from "./outbound-network-guard";

// The real functions, captured before any test runs: a guard that leaked its
// replacements from one test would otherwise hand the next test a "genuine"
// original that is really the leftover replacement.
const REAL = {
  fetch: globalThis.fetch,
  httpRequest: http.request,
  httpsRequest: https.request,
  connect: net.Socket.prototype.connect,
};

// The guard is only evidence if it demonstrably catches what it claims to, so
// each channel is tried here with an address that would fail to resolve even
// if the guard let it through.
describe("recordOutboundAttempts", () => {
  it("records nothing when the code under test stays offline", async () => {
    const attempts = await recordOutboundAttempts(() => 1 + 1);
    expect(attempts).toEqual([]);
  });

  it("catches fetch, and names only the host", async () => {
    const attempts = await recordOutboundAttempts(async () => {
      await fetch("https://telemetry.invalid/secret/path?token=abc").catch(
        () => undefined,
      );
    });
    expect(attempts).toEqual([{ via: "fetch", target: "telemetry.invalid" }]);
  });

  it("catches fetch given a Request or a URL object", async () => {
    const attempts = await recordOutboundAttempts(async () => {
      await fetch(new Request("https://a.invalid/")).catch(() => undefined);
      await fetch(new URL("https://b.invalid/")).catch(() => undefined);
    });
    expect(attempts.map((attempt) => attempt.target)).toEqual([
      "a.invalid",
      "b.invalid",
    ]);
  });

  it("catches http.request and https.request", async () => {
    const attempts = await recordOutboundAttempts(() => {
      for (const attempt of [
        () => http.request({ hostname: "plain.invalid" }),
        () => https.request("https://secure.invalid/otlp"),
      ]) {
        try {
          attempt();
        } catch {
          // the guard's refusal — the attempt is what is being recorded
        }
      }
    });
    expect(attempts).toEqual([
      { via: "http", target: "plain.invalid" },
      { via: "https", target: "secure.invalid" },
    ]);
  });

  it("catches a raw socket, which is where http.get and every HTTP client end up", async () => {
    const attempts = await recordOutboundAttempts(() => {
      for (const attempt of [
        () => new net.Socket().connect(4318, "collector.invalid"),
        () => http.get("http://via-get.invalid/"),
      ]) {
        try {
          attempt();
        } catch {
          // the guard's refusal
        }
      }
    });
    expect(attempts.map((attempt) => attempt.via)).toEqual([
      "socket",
      "socket",
    ]);
    expect(attempts[0]!.target).toBe("collector.invalid:4318");
  });

  it("lets an unexpected error from the code under test fail the test", async () => {
    await expect(
      recordOutboundAttempts(() => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("puts every channel back afterwards, even when the code under test throws", async () => {
    await recordOutboundAttempts(() => undefined);
    await recordOutboundAttempts(() => {
      throw new Error("boom");
    }).catch(() => undefined);

    expect(globalThis.fetch).toBe(REAL.fetch);
    expect(http.request).toBe(REAL.httpRequest);
    expect(https.request).toBe(REAL.httpsRequest);
    expect(net.Socket.prototype.connect).toBe(REAL.connect);
  });
});
