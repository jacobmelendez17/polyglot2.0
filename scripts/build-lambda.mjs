#!/usr/bin/env node
/**
 * Bundles the curriculum-import Lambda (spec 19 §48 step 11) into a single
 * deployable `dist/lambda/curriculum-import/index.js`. Terraform's own
 * `archive_file` data source zips it from there (`infra/terraform/modules/curriculum-import/main.tf`)
 * — no reason to duplicate zipping in both places, and letting Terraform own
 * it means `terraform plan` naturally detects a changed bundle and redeploys.
 *
 * `aws/lambda/curriculum-import/handler.ts` and everything it imports
 * (`domains/admin/bulk-import-service.ts`, `db/schema`, etc.) live in the
 * main Next.js source tree, resolved through the same `@/*` path alias the
 * rest of the app uses — esbuild's own `alias` option handles that without a
 * separate tsconfig for this one script. Dependencies are bundled, not
 * externalized, node_modules included: Lambda's own runtime doesn't ship a
 * matching `@neondatabase/serverless`/`drizzle-orm`, and bundling everything
 * into one file is simpler and more reliable than a Lambda Layer kept
 * separately in sync with the app's own dependency versions.
 *
 * Usage:
 *   npm run lambda:build
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "dist/lambda/curriculum-import");
const OUT_FILE = resolve(OUT_DIR, "index.js");

await rm(resolve(process.cwd(), "dist/lambda"), {
  recursive: true,
  force: true,
});
await mkdir(OUT_DIR, { recursive: true });

await build({
  entryPoints: ["aws/lambda/curriculum-import/handler.ts"],
  outfile: OUT_FILE,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  alias: { "@": process.cwd() },
  sourcemap: false,
  minify: false,
  logLevel: "info",
});

console.log(`Built ${OUT_FILE}`);
