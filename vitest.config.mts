import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Telemetry is off for the whole fast suite (spec 27 §13.1), whatever a
// developer's .env.local enables — these win over it, below. A test that needs
// an enabled configuration hands `parseTelemetryConfig` its own source object.
//
// Listed here rather than imported from `lib/telemetry-config.ts`'s
// TELEMETRY_SWITCHES: a Vite config that imports application code is flagged by
// Vite's planned native config loader. `lib/env.test.ts` fails if this list and
// TELEMETRY_SWITCHES ever differ, so a new switch cannot be forgotten.
const TELEMETRY_OFF = {
  POSTHOG_ENABLED: "false",
  TELEMETRY_METRICS_ENABLED: "false",
  TELEMETRY_TRACES_ENABLED: "false",
  TELEMETRY_LOGS_ENABLED: "false",
  TELEMETRY_ALLOW_NON_PRODUCTION: "false",
};

// Placeholders for what `lib/env.ts` (its typed, fail-fast config accessor)
// requires, so the fast suite runs on a bare checkout — CI has no `.env.local`,
// and a unit test must not need a developer's secrets. A real value from the
// shell or a `.env` file always wins (below); none of these can reach a
// service — the keys are inert, the secrets are test-only, and the database
// URL points nowhere, so a unit test that touched the database would fail
// instead of reaching one.
const TEST_ENV_DEFAULTS = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    "pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk",
  CLERK_SECRET_KEY: "sk_test_unit_tests_only",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/sign-up",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/dashboard",
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/onboarding",
  LESSON_STATE_SECRET: "unit-tests-only-lesson-state-secret-0123456789",
  REVIEW_STATE_SECRET: "unit-tests-only-review-state-secret-0123456789",
  DATABASE_URL: "postgresql://unit-tests-only:unused@127.0.0.1:1/unused",
};

// Vitest does not auto-load .env.local the way `next dev` does; without
// this, any module importing lib/env.ts throws in tests. Load it the same way
// Vite's own dev/build pipeline does, so tests see the same environment as the
// running app — over the placeholders above.
export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    env: {
      ...TEST_ENV_DEFAULTS,
      ...loadEnv(mode, process.cwd(), ""),
      ...TELEMETRY_OFF,
    },
    // Database integration tests (spec 08 §43) live in a separate Vitest
    // project (vitest.integration.config.mts, `npm run test:integration`) so
    // this normal fast suite never requires a real database connection.
    // The Playwright E2E suite (spec 22, `npm run test:e2e`) lives under
    // tests/e2e/ and uses `@playwright/test`'s own `test`/`expect`, which
    // are not Vitest constructs — Vitest's default `*.spec.ts` pattern would
    // otherwise also try (and fail) to run them directly.
    exclude: ["**/node_modules/**", "**/*.integration.test.ts", "tests/e2e/**"],
  },
}));
