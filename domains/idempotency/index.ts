/**
 * Public surface for `domains/idempotency` (spec 08 §53). No file here
 * imports the real `db` singleton or any secret — every function takes a
 * `DbClient` explicitly, so callers (a future spec 07 unit 6, most likely)
 * compose it into their own transaction rather than this domain owning one.
 * Safe to import from anywhere, including a `"use client"` component,
 * though nothing does yet — there is no user-facing consumer in this spec.
 */
export { cleanupExpiredIdempotencyKeys } from "./cleanup";
export { computeRequestHash } from "./hash";
export { getIdempotencyRetentionMs } from "./retention-config";
export { withIdempotency } from "./with-idempotency";
export type { IdempotencyStatus, WithIdempotencyInput } from "./types";
