#!/usr/bin/env node
/**
 * Spec 23's Vercel build command (`vercel.json`'s `buildCommand`) — the one
 * place that decides whether a Vercel build also migrates/seeds a database,
 * based on Vercel's own `VERCEL_ENV` (architecture.md: never branch on
 * hostname/branch name/NODE_ENV, but VERCEL_ENV is exactly the documented
 * environment identity Vercel itself provides).
 *
 * - preview: apply migrations, then seed safe curriculum/test fixtures
 *   (db/seed/preview.ts), against the Neon branch the Vercel-Neon preview
 *   integration already attached to this deployment's own DATABASE_URL —
 *   this *is* spec 23's "Preview Migrations" sequence (create/attach branch
 *   is the integration's job, not this script's).
 * - production: build only. Production migrations are a separate, gated
 *   step `.github/workflows/deploy-production.yml` runs *before* calling
 *   into this build — never here, and never a seed (architecture.md's "no
 *   development/test data in production").
 * - anything else (local `vercel dev`, a misconfigured environment): build
 *   only, since there is no environment identity to safely act on.
 */
import { execSync } from "node:child_process";

function run(command) {
  console.log(`$ ${command}`);
  execSync(command, { stdio: "inherit" });
}

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv === "preview") {
  run("npm run db:migrate");
  run("tsx db/seed/preview.ts");
} else if (vercelEnv === "production") {
  console.log(
    "VERCEL_ENV=production — building only. Migrations are applied by deploy-production.yml before this build runs.",
  );
} else {
  console.log(`VERCEL_ENV=${vercelEnv ?? "(unset)"} — building only.`);
}

run("next build");
