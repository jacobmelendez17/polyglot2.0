/** Spec 08 §8/§53 — Idempotency Status. */
export type IdempotencyStatus = "in_progress" | "succeeded";

export interface WithIdempotencyInput {
  userId: string;
  /** Stable logical operation name, e.g. "lesson.complete" — never a URL. */
  operation: string;
  /** The client-generated UUID for this logical operation. */
  key: string;
  /** Hashed via `computeRequestHash` — never stored or logged raw. */
  payload: unknown;
}
