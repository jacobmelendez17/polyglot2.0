import { createHash } from "node:crypto";

/**
 * Spec 27 Unit 27.7 — who a health request counts against.
 *
 * The probes are public, so the only subject there is to rate limit is the
 * caller's address. It is hashed before it is used as a key: a raw address
 * would sit in a Redis key or an in-memory map for no reason, and the limiter
 * only needs to tell callers apart, not to know them. On Vercel the platform
 * sets `x-forwarded-for` to the real client address.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 16);
}
