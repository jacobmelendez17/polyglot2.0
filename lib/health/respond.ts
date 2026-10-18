/**
 * Spec 27 Unit 27.7 — the shape of every health response.
 *
 * Never cached (a probe that is answered from a cache measures the cache),
 * always JSON, and never anything beyond a coarse status word: no versions, no
 * build ids, no host names, no error text (spec 27 §9.1: "do not leak build
 * internals", "do not expose credentials or detailed dependency errors").
 */

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function healthResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, ...extraHeaders },
  });
}

export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return healthResponse(
    429,
    { status: "rate_limited" },
    { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  );
}
