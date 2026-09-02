/** Spec 08 §53 — "The retention window is configuration, not a literal." Both `withIdempotency` (setting `expires_at`) and the cleanup script consume this. */
const IDEMPOTENCY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getIdempotencyRetentionMs(): number {
  return IDEMPOTENCY_RETENTION_MS;
}
