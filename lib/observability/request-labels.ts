/**
 * Spec 27 Unit 27.5 — the only way a request becomes a metric or span label.
 *
 * Telemetry labels must come from a small closed set (spec 27 §7.2: "never
 * label metrics with … raw URL … or arbitrary exception text"), because every
 * distinct label combination is a separate series against Grafana Cloud's Free
 * limit of 10,000 active series. Everything here therefore maps an arbitrary
 * input — a header, a route template, a status code — onto a fixed vocabulary,
 * and anything it does not recognise becomes one catch-all value rather than a
 * new label. Pure functions, no I/O.
 */

export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export type HttpMethodLabel = (typeof HTTP_METHODS)[number] | "OTHER";

export function normalizeMethod(method: unknown): HttpMethodLabel {
  if (typeof method !== "string") return "OTHER";
  const upper = method.toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(upper)
    ? (upper as HttpMethodLabel)
    : "OTHER";
}

export type StatusClassLabel =
  "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "unknown";

export function statusClass(status: unknown): StatusClassLabel {
  if (typeof status !== "number" || !Number.isInteger(status)) return "unknown";
  if (status < 100 || status > 599) return "unknown";
  return `${Math.floor(status / 100)}xx` as StatusClassLabel;
}

/** What a route that could not be turned into a safe template is called. */
export const UNMATCHED_ROUTE = "unmatched";

/** A route template is at most this many segments deep; deeper detail only multiplies series. */
const MAX_ROUTE_SEGMENTS = 3;
const MAX_ROUTE_LENGTH = 200;

// Letters, digits and the punctuation a Next.js route template uses:
// `[id]`, `[...slug]`, `_not-found`, `.well-known`, `@modal`. No whitespace,
// no `?`, `#`, `%` or `=` — so a query string, an encoded value or a pasted
// token can never survive as a label.
const SAFE_ROUTE = /^\/[A-Za-z0-9/_\-.[\]@~()]*$/;
const DYNAMIC_SEGMENT = /^\[\[?\.{0,3}[A-Za-z0-9_-]*\]?\]$/;

/**
 * Turns a Next.js route template (`/items/[id]`, `/api/v1/admin/levels/[levelId]/publish`)
 * into a bounded label. Dynamic segments become `:param`, and the path is cut
 * to its first three segments, so `/api/v1/admin/levels/[levelId]/publish` is
 * reported as `/api/v1/admin`. A concrete URL path is not a template and is
 * never accepted as one: anything that is not a plain route pattern is
 * `unmatched`.
 */
export function normalizeRoute(route: unknown): string {
  if (typeof route !== "string") return UNMATCHED_ROUTE;
  if (route.length === 0 || route.length > MAX_ROUTE_LENGTH) {
    return UNMATCHED_ROUTE;
  }
  if (!SAFE_ROUTE.test(route)) return UNMATCHED_ROUTE;

  const segments = route
    .split("/")
    .filter((segment) => segment.length > 0)
    .slice(0, MAX_ROUTE_SEGMENTS)
    .map((segment) => (DYNAMIC_SEGMENT.test(segment) ? ":param" : segment));

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** The health endpoints are probes, not traffic: they are not "eligible" requests for the SLIs (spec 27 §9.3). */
export function isHealthRoute(route: string): boolean {
  return route === "/api/health" || route.startsWith("/api/health/");
}

export type RequestOperationLabel = "page" | "api" | "action" | "other";

/**
 * A coarse kind of request, from facts that are already bounded: a Server
 * Action is a `POST` to a page's own route, a route handler lives under
 * `/api`, a page render is a `GET`/`HEAD`.
 */
export function requestOperation(
  method: HttpMethodLabel,
  route: string,
): RequestOperationLabel {
  if (route.startsWith("/api/")) return "api";
  if (method === "POST") return "action";
  if (method === "GET" || method === "HEAD") return "page";
  return "other";
}
