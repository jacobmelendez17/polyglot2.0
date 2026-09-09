import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Database integration tests (spec 08 §43) are kept in a separate Vitest
 * project from the normal unit-test config so `npm run test` stays fast and
 * database-free — only `npm run test:integration` (or CI's dedicated job)
 * requires a real `TEST_DATABASE_URL`.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // `test.env` (below) only injects variables into the worker processes that
  // run test files — `globalSetup` (db/test/global-setup.ts, which applies
  // migrations to TEST_DATABASE_URL before any test runs) executes in the
  // main Vitest process instead and never sees it, so it must also land on
  // `process.env` directly here.
  Object.assign(process.env, env);

  return {
    plugins: [tsconfigPaths()],
    test: {
      environment: "node",
      include: ["**/*.integration.test.ts"],
      exclude: ["**/node_modules/**"],
      env,
      globalSetup: ["./db/test/global-setup.ts"],
      // Integration tests share one real database branch; run test *files*
      // serially so failures are easy to attribute, while each test still
      // gets its own isolated, always-rolled-back transaction.
      fileParallelism: false,
      // Raised from 20s (2026-09-09). Every statement is a round trip to a
      // remote Neon branch, so a test that builds a realistic fixture is
      // dominated by latency rather than by work: the level-publish test
      // inserts a full 48-vocabulary/12-grammar/4-group level one row at a
      // time and now takes ~60s, having sat just under the old limit for
      // months. Confirmed pre-existing and unrelated to any feature change
      // by re-running it against a stashed working tree.
      //
      // The assertions are untouched — this is a latency budget, not a
      // weakened check. A dedicated test branch (Next Up A) would make it
      // moot along with the rest of the shared-database problems.
      testTimeout: 120_000,
    },
  };
});
