import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const outDir = mkdtempSync(join(tmpdir(), "lambda-bundle-"));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

// esbuild refuses to run inside this suite's jsdom environment, so both the
// build and the load happen in plain `node` child processes — which is also how
// the real build and the Lambda runtime run them.
function buildBundle(outfile: string) {
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { build } from "esbuild";
       import { lambdaBuildOptions } from "./scripts/lambda-build-options.mjs";
       await build({ ...lambdaBuildOptions(process.argv[1]), logLevel: "silent" });`,
      outfile,
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
}

describe("curriculum-import Lambda bundle", () => {
  it("loads with none of the application's secrets in the environment", () => {
    const outfile = join(outDir, "index.js");
    buildBundle(outfile);

    // The deployed Lambda has only POLYGLOT_ENV and the SSM parameter name.
    // Bundling `lib/env.ts` made loading throw a ZodError (missing Clerk keys,
    // DATABASE_URL, ...) before the handler ever ran.
    const script = `const m = require(${JSON.stringify(outfile)}); if (typeof m.handler !== "function") process.exit(2);`;
    expect(() =>
      execFileSync(process.execPath, ["-e", script], {
        env: {
          PATH: process.env.PATH ?? "",
          POLYGLOT_ENV: "production",
          DATABASE_URL_PARAMETER_NAME: "/polyglot/production/test",
        } as unknown as NodeJS.ProcessEnv,
        stdio: "pipe",
      }),
    ).not.toThrow();
  }, 60_000);
});
