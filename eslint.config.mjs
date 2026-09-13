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
    // Generated Lambda bundle (spec 19 §48 step 11, scripts/build-lambda.mjs)
    // — esbuild output, never hand-edited and never committed (.gitignore).
    "dist/**",
  ]),
]);

export default eslintConfig;
