import { and, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { idempotencyKeys } from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";

import { computeRequestHash } from "./hash";
import { getIdempotencyRetentionMs } from "./retention-config";
import type { WithIdempotencyInput } from "./types";

/** PostgreSQL's `lock_not_available` SQLSTATE — raised when `lock_timeout` elapses. */
const LOCK_NOT_AVAILABLE_SQLSTATE = "55P03";

function hasSqlState(error: unknown, sqlState: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  // The driver's raw error carries `.code` directly; Drizzle wraps it in a
  // `DrizzleQueryError` whose own `.code` is undefined and nests the raw
  // error under `.cause` instead — confirmed empirically against the real
  // Neon driver (drizzle-orm@this-repo's pinned version) while wiring up
  // this domain's concurrency test.
  return code === sqlState || (typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === sqlState);
}

function isLockTimeout(error: unknown): boolean {
  return hasSqlState(error, LOCK_NOT_AVAILABLE_SQLSTATE);
}

/**
 * Spec 08 §53's idempotency helper. Runs `fn` exactly once for a given
 * `(userId, operation, key)`:
 *
 * 1. A first call inserts the key row (`in_progress`), runs `fn` **inside
 *    that same transaction**, records the result, and commits — the key row
 *    and `fn`'s effect always commit or roll back together, never separately.
 * 2. A repeat call with the same key and an identical payload replays the
 *    stored result without re-running `fn`. The replay round-trips through
 *    `jsonb`, so a `Date` field in `fn`'s return value comes back as an ISO
 *    string, not a `Date` instance — callers that care about the type, not
 *    just the value, should normalize accordingly.
 * 3. A repeat call with the same key but a different payload is rejected
 *    with `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
 * 4. A genuinely concurrent call for the same key — one whose `INSERT`
 *    blocks on the first call's still-open transaction — is rejected with
 *    `IDEMPOTENCY_OPERATION_IN_PROGRESS` once `lockTimeoutMs` elapses,
 *    rather than hanging for the duration of `fn`. (Postgres blocks a
 *    second `INSERT` targeting the same unique-constrained row until the
 *    first transaction resolves; a short `lock_timeout` turns that wait
 *    into a fast, retryable error instead.)
 *
 * Takes an injected `DbClient`, not the `db` singleton — see
 * `domains/users/user-repository.ts` for why.
 */
export async function withIdempotency<T>(
  db: DbClient,
  input: WithIdempotencyInput,
  fn: (tx: DbClient) => Promise<T>,
  options: { lockTimeoutMs?: number } = {},
): Promise<T> {
  const requestHash = computeRequestHash(input.payload);
  const lockTimeoutMs = Math.max(1, Math.trunc(options.lockTimeoutMs ?? 5000));

  return db.transaction(async (tx) => {
    // Scoped to this transaction only (SET LOCAL) — never leaks to other
    // statements on the same pooled connection. `lockTimeoutMs` is always a
    // number (TypeScript-enforced), so inlining it as a literal here can't
    // introduce SQL injection the way interpolating an arbitrary string would.
    await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`));

    let inserted: typeof idempotencyKeys.$inferSelect | undefined;
    try {
      [inserted] = await tx
        .insert(idempotencyKeys)
        .values({
          userId: input.userId,
          operation: input.operation,
          key: input.key,
          requestHash,
          status: "in_progress",
          expiresAt: new Date(Date.now() + getIdempotencyRetentionMs()),
        })
        .onConflictDoNothing({
          target: [idempotencyKeys.userId, idempotencyKeys.operation, idempotencyKeys.key],
        })
        .returning();
    } catch (error) {
      if (isLockTimeout(error)) {
        throw new AppError("IDEMPOTENCY_OPERATION_IN_PROGRESS");
      }
      throw error;
    }

    if (inserted) {
      const result = await fn(tx);
      await tx
        .update(idempotencyKeys)
        .set({ status: "succeeded", responseSnapshot: result as Record<string, unknown> })
        .where(eq(idempotencyKeys.id, inserted.id));
      return result;
    }

    // Conflict: the row already existed and the earlier transaction that
    // created it has since committed (an uncommitted conflict would have
    // hit the lock_timeout catch above instead).
    const [existing] = await tx
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.userId, input.userId),
          eq(idempotencyKeys.operation, input.operation),
          eq(idempotencyKeys.key, input.key),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new Error("Idempotency key insert conflicted, but no existing row was found — this should never happen.");
    }

    if (existing.requestHash !== requestHash) {
      throw new AppError("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH");
    }
    if (existing.status === "in_progress") {
      // Defensive: not reachable via the lock-blocking path above, but kept
      // as a direct, honest response to spec §53 step 7 if a row is ever
      // observed in this state by some other path.
      throw new AppError("IDEMPOTENCY_OPERATION_IN_PROGRESS");
    }
    return existing.responseSnapshot as T;
  });
}
