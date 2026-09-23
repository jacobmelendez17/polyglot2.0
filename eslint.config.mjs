import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Spec 22's E2E dev server uses a separate distDir (next.config.ts's
    // `E2E_SERVER` conditional) so it can run alongside the normal dev
    // server — its generated route-type validator needs the same ignore
    // `.next/**` gets, since it's build output, not hand-written code.
    ".next-e2e/**",
    // Generated Lambda bundle (spec 19 §48 step 11, scripts/build-lambda.mjs)
    // — esbuild output, never hand-edited and never committed (.gitignore).
    "dist/**",
    // Playwright's own generated HTML report and trace-viewer bundle
    // (spec 22, `npm run test:e2e`) — third-party build output, never
    // hand-edited and never committed (.gitignore), same reasoning as
    // `.next-e2e/**` above. Found the same way that one was: a full `npm
    // run lint` reporting thousands of false positives once the directory
    // existed on disk.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
