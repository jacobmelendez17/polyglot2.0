import { createHash } from "node:crypto";

/** Recursively sorts object keys so two structurally-equal payloads always serialize identically regardless of property insertion order. Array order is preserved — it's meaningful. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** A stable hash over a canonical serialization of `payload` (spec 08 §53) — used to detect a replayed idempotency key whose request body actually differs. */
export function computeRequestHash(payload: unknown): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash("sha256").update(canonical).digest("hex");
}
