import { TransactionRollbackError } from "drizzle-orm";

import { testDb } from "./test-client";

/** Inferred directly from `testDb.transaction`'s own callback parameter, so it can never drift out of sync with the real type. */
export type TestTx = Parameters<Parameters<typeof testDb.transaction>[0]>[0];

/**
 * Runs `fn` inside a real PostgreSQL transaction and always rolls it back —
 * spec 08 §42's "transaction-per-test rollback" isolation strategy. Every
 * integration test gets a fully real, constraint-enforcing transaction, but
 * nothing it writes ever persists, so tests can run in any order without
 * cleaning up after themselves or interfering with each other.
 *
 * Test code must perform all of its reads/writes through the `tx` handle
 * passed to `fn` — using the top-level `db` inside a test would run outside
 * the transaction and actually persist.
 */
export async function withTestTransaction<T>(fn: (tx: TestTx) => Promise<T>): Promise<T> {
  let result: T | undefined;

  try {
    await testDb.transaction(async (tx) => {
      result = await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }

  return result as T;
}
