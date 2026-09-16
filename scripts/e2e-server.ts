import { config } from "dotenv";

// Runs as a standalone `tsx` CLI script — load .env.local before anything
// else touches process.env, same pattern as every other script here.
config({ path: ".env.local" });

import { spawn } from "node:child_process";

import { assertSafeE2EDatabaseUrl } from "@/db/test/db-safety-guard";

/**
 * `npm run e2e:server` (spec 22). Starts the "isolated Next.js E2E server"
 * the spec describes: a normal `next dev` process whose `DATABASE_URL` is
 * overridden to `E2E_DATABASE_URL` instead of the developer's real database.
 *
 * This override — never accidentally reachable from a normal `next dev` —
 * *is* this app's "explicit E2E/test configuration" (spec 22's E2E Database
 * Safety Guard requirement). `APP_ENV` stays "development" rather than
 * inventing a new value: `lib/env.ts`'s schema only recognizes development/
 * preview/production, and widening that enum is an architecture change spec
 * 22 does not ask for. Safety instead comes from `assertSafeE2EDatabaseUrl`
 * below, which fails closed before the server ever starts.
 *
 * Playwright's `webServer` config (`playwright.config.ts`) launches this
 * automatically for local runs.
 */
function main(): void {
  const e2eDatabaseUrl = assertSafeE2EDatabaseUrl();
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3100";
  const port = new URL(baseUrl).port || "3100";

  const child = spawn("npx", ["next", "dev", "-p", port], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: e2eDatabaseUrl,
      // Isolates this server's build/lock state from a normal `next dev`
      // session — see next.config.ts.
      E2E_SERVER: "1",
    },
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

main();
