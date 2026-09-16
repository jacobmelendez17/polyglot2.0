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
  ]),
]);

export default eslintConfig;
