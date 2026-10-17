import http from "node:http";
import https from "node:https";
import net from "node:net";

import { vi } from "vitest";

/**
 * Test support for spec 27's central promise: with telemetry disabled or
 * blocked, the application makes **zero** outbound requests (spec 27 §4, §14).
 * "Zero" is only worth asserting if the check cannot be fooled by a vendor SDK
 * choosing a different way to reach the network, so this refuses every channel
 * a Node process has: `fetch`, `http.request`, `https.request`, and — beneath
 * them all, including `http.get`, undici and any HTTP/2 client — the socket
 * `connect` they end in.
 *
 * Nothing is ever really sent: each channel is replaced for the duration of
 * `run` with a function that records the attempt and fails, so a test that
 * trips it fails loudly (and offline).
 *
 * Unit 27.3 onwards reuse this for the "enabled adapter, injected fake
 * transport" cases by asserting what was attempted instead of expecting none.
 */

export type OutboundAttempt = {
  via: "fetch" | "http" | "https" | "socket";
  /** Host (and port) only — never a path or query, which could carry a token. */
  target: string;
};

function hostOf(value: unknown): string {
  try {
    if (typeof value === "string" || value instanceof URL) {
      return new URL(value).host;
    }
    if (value instanceof Request) return new URL(value.url).host;
    if (value && typeof value === "object") {
      const options = value as { host?: unknown; hostname?: unknown };
      const host = options.hostname ?? options.host;
      if (typeof host === "string") return host;
    }
  } catch {
    // A malformed target is still an attempt; fall through to the label below.
  }
  return "unknown";
}

function socketTarget(args: unknown[]): string {
  const [first, second] = args;
  if (typeof first === "number") {
    return `${typeof second === "string" ? second : "localhost"}:${first}`;
  }
  if (first && typeof first === "object") {
    const options = first as { host?: unknown; port?: unknown; path?: unknown };
    if (typeof options.path === "string") return `unix:${options.path}`;
    return `${typeof options.host === "string" ? options.host : "localhost"}:${String(options.port)}`;
  }
  return "unknown";
}

/**
 * Runs `run` with all outbound channels refused and returns every attempt made.
 * An error thrown by `run` (including the refusal itself, if the code under
 * test does not swallow it) propagates, so a test cannot pass by accident.
 */
export async function recordOutboundAttempts(
  run: () => unknown,
): Promise<OutboundAttempt[]> {
  const attempts: OutboundAttempt[] = [];

  const refusal = (via: OutboundAttempt["via"], target: string): Error => {
    attempts.push({ via, target });
    return new Error(
      `Outbound network access is not allowed in this test (${via} → ${target}).`,
    );
  };

  // Node's request and connect functions are overloaded, which `spyOn` cannot
  // type; each replacement ignores its arguments except to name the target.
  // `fetch` fails the way the real one does — a rejected promise, never a
  // synchronous throw — so code that handles a failed fetch behaves as it
  // would offline; the callback-style channels throw.
  type AnyFunction = (...args: unknown[]) => unknown;
  const replace = (
    owner: object,
    method: string,
    via: OutboundAttempt["via"],
    describe: (args: unknown[]) => string,
  ) =>
    vi.spyOn(owner as Record<string, AnyFunction>, method).mockImplementation(((
      ...args: unknown[]
    ) => {
      const error = refusal(via, describe(args));
      if (via === "fetch") return Promise.reject(error);
      throw error;
    }) as never);

  const replaced = [
    replace(globalThis, "fetch", "fetch", ([input]) => hostOf(input)),
    replace(http, "request", "http", ([input]) => hostOf(input)),
    replace(https, "request", "https", ([input]) => hostOf(input)),
    replace(net.Socket.prototype, "connect", "socket", socketTarget),
  ];

  try {
    await run();
  } finally {
    for (const spy of replaced) spy.mockRestore();
  }
  return attempts;
}
