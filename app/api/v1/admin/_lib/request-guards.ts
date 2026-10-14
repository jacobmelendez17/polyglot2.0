import type { AdminApiErrorCode } from "@/domains/admin";

import { AdminApiRequestError } from "./admin-api-errors";

/**
 * Guards every state-changing Admin request passes *before* anything else
 * looks at it (spec 26 §5: "validated methods/content types, appropriate
 * Origin/Fetch Metadata checks for state changes").
 *
 * Authentication here is a cookie, which a browser attaches to a request no
 * matter which site caused it — the exact condition CSRF exploits. These
 * checks are what stop another origin from using a signed-in Admin's browser
 * to publish. They are pure (headers in, verdict out) so each rule is tested
 * on its own.
 */

/** The largest body most Admin commands need. A publish command is ~120 bytes. */
export const MAX_COMMAND_BODY_BYTES = 4096;

/**
 * The cap for the bulk curriculum commands, which carry up to
 * `CURRICULUM_BULK_ITEM_LIMIT` ids. A hundred ids are about 4 KiB compact, so
 * the default cap holds them only by a few dozen bytes: a move that names a
 * level *and* a group is already past it, and so is any request with a space or
 * a newline in it. These are the one kind of command whose honest maximum does
 * not fit with room to spare. Still small, and still enforced while the body
 * streams in.
 */
export const MAX_BULK_COMMAND_BODY_BYTES = 8192;

export type OriginVerdict =
  | { ok: true }
  | { ok: false; reason: "cross-site" | "origin-mismatch" | "missing" };

type HeaderReader = Pick<Headers, "get">;

/**
 * Is this request demonstrably from this app's own pages?
 *
 * 1. **`Sec-Fetch-Site`** decides whenever the browser sends it. The browser
 *    sets it, page script cannot, and no other site can forge `same-origin`.
 *    `same-site` (a sibling subdomain), `cross-site`, and `none` are refused.
 *    It is deliberately *not* cross-checked against `Origin` or the request
 *    URL: the browser has already compared the page with the target as the
 *    user's address bar names it, whereas this server's own view of its URL
 *    (behind a proxy that rewrites the host or scheme) can legitimately differ.
 * 2. **`Origin`**, only when there is no `Sec-Fetch-Site` (an older browser):
 *    it must equal this request's own origin. `Origin: null` (sandboxed frames,
 *    some redirects) is a mismatch.
 * 3. **Neither header** — fail closed. Every current browser sends at least
 *    one on a `fetch` POST; a request with neither is not a browser using a
 *    victim's session, and the Admin console has no non-browser caller.
 */
export function checkSameOrigin(
  headers: HeaderReader,
  requestUrl: string,
): OriginVerdict {
  const site = headers.get("sec-fetch-site");
  if (site !== null) {
    return site === "same-origin"
      ? { ok: true }
      : { ok: false, reason: "cross-site" };
  }

  const origin = headers.get("origin");
  if (origin === null) return { ok: false, reason: "missing" };
  return origin === new URL(requestUrl).origin
    ? { ok: true }
    : { ok: false, reason: "origin-mismatch" };
}

/** `application/json`, with or without parameters (`; charset=utf-8`). A cross-site HTML form cannot send it. */
export function isJsonContentType(value: string | null): boolean {
  return value?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

function reject(code: AdminApiErrorCode, message: string): never {
  throw new AdminApiRequestError(code, message);
}

/** Throws the typed rejection for a request that fails the Origin or content-type rules; returns otherwise. */
export function assertCommandRequest(request: Request): void {
  const verdict = checkSameOrigin(request.headers, request.url);
  if (!verdict.ok) {
    reject("FORBIDDEN", "Cross-origin requests are not allowed.");
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    reject("UNSUPPORTED_MEDIA_TYPE", "Send the request as application/json.");
  }
  // "No credentials in query strings": a command's data belongs in the body.
  if (new URL(request.url).search !== "") {
    reject("VALIDATION_FAILED", "That request could not be understood.");
  }
}

/**
 * Reads the body as text, refusing to buffer more than `maxBytes`. The
 * `Content-Length` header is only a fast path — it can lie or be absent
 * (chunked) — so the stream itself is counted, and cancelled the moment it
 * goes over.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const tooLarge = () =>
    reject("PAYLOAD_TOO_LARGE", "That request is too large.");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) tooLarge();

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Parses a command body as JSON, turning malformed input into the standard 422 instead of a crash. */
export function parseJsonBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return reject("VALIDATION_FAILED", "That request could not be understood.");
  }
}
