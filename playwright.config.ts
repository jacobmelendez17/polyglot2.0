import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/**
 * Spec 22's committed critical E2E suite.
 *
 * - Chromium only for the full critical-path suite; one mobile-Chromium
 *   smoke project at ~390x844. Broader cross-browser coverage is explicitly
 *   out of scope for this spec (the future release-candidate spec).
 * - Single worker: the suite drives two permanent, shared Clerk identities
 *   (learner/admin) rather than one identity per test, so concurrent tests
 *   would mutate the same account state.
 * - Zero retries locally — a flaky E2E test here means a real race,
 *   contamination, or missing wait, not environment noise (spec 22's Flake
 *   Policy). The future CI/CD spec may allow exactly one retry, but that is
 *   its decision to make, not this config's.
 * - Trace/screenshot/video retained on failure only, never on success.
 * - `webServer` starts the isolated E2E Next.js server (DATABASE_URL bound
 *   to E2E_DATABASE_URL, see scripts/e2e-server.ts) automatically for local
 *   runs; CI/preview point `E2E_BASE_URL` at an already-running deployment
 *   instead (spec 22's "E2E Future CI Model") and should set
 *   PLAYWRIGHT_SKIP_WEB_SERVER=1.
 */
export default defineConfig({
  testDir: "./tests/e2e/specs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Local `next dev` cold-compiles each route (and, the first time a lesson
  // reaches it, the quiz bundle) on its first hit within a given dev-server
  // process — observed up to ~60s for a single such compile, well past
  // Playwright's 30s default. Generous rather than tuned tight, so that
  // reads as compile latency rather than a hang. Not a synchronization
  // workaround (code-standards.md's "no arbitrary sleeps" rule): assertions
  // still wait for real page state; this only gives one test more
  // wall-clock room before Playwright gives up on it. A `next build` +
  // `next start` preview server (the future CI/CD spec) pays this cost once
  // at build time instead, not per route on first visit.
  timeout: 90_000,
  // `expect()`'s own default (5s) is too short for an assertion that
  // follows a mutating Server Action on this local dev server (see
  // `timeout` above) — 15s gives real state changes room to land without
  // papering over a genuine hang, which would still exceed this.
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /mobile\.smoke\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
      dependencies: ["setup"],
      testMatch: /mobile\.smoke\.spec\.ts/,
    },
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEB_SERVER
    ? {}
    : {
        webServer: {
          command: "npm run e2e:server",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
