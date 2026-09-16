import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Vitest does not auto-load .env.local the way `next dev` does; without
// this, any module importing lib/env.ts (its typed, fail-fast config
// accessor) throws in tests. Load it the same way Vite's own dev/build
// pipeline does, so tests see the same environment as the running app.
export default defineConfig(({ mode }) => ({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    env: loadEnv(mode, process.cwd(), ""),
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
