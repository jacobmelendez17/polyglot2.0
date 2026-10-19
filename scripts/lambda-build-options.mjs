/**
 * esbuild options for the curriculum-import Lambda bundle, shared by
 * `scripts/build-lambda.mjs` and the test that loads the built bundle with no
 * secrets in the environment (`aws/lambda/curriculum-import/lambda-bundle.test.ts`).
 *
 * `@/lib/env` is aliased to a stand-in because the real module validates every
 * application secret at import time and the Lambda has none of them — see
 * `aws/lambda/curriculum-import/lambda-env.ts`. The more specific alias is
 * listed first.
 */
import { resolve } from "node:path";

export function lambdaBuildOptions(outfile) {
  return {
    entryPoints: ["aws/lambda/curriculum-import/handler.ts"],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    alias: {
      "@/lib/env": resolve(
        process.cwd(),
        "aws/lambda/curriculum-import/lambda-env.ts",
      ),
      "@": process.cwd(),
    },
    sourcemap: false,
    minify: false,
    logLevel: "info",
  };
}
