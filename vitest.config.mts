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
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
  },
}));
