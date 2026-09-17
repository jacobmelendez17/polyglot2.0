#!/usr/bin/env node
/**
 * Spec 23's Production Deployment Smoke Test — small, non-destructive,
 * read-only HTTP checks run after every production deployment
 * (`deploy-production.yml`). Explicitly out of scope: a real Playwright
 * pass (that's `e2e.yml`, against preview only) or anything destructive.
 *
 * Checks, matching the spec's exact list:
 *   1. production URL responds
 *   2. landing page renders
 *   3. authentication entry point renders
 *   4. protected route enforcement works
 *   5. a database-backed application request succeeds
 *
 * (5) reuses the existing account-deletion finalize cron endpoint (spec 20)
 * rather than inventing a health/readiness endpoint — spec 23 explicitly
 * scopes those out, and this route already does a real, idempotent
 * database round trip authenticated by the same CRON_SECRET Vercel Cron
 * itself uses (app/api/cron/finalize-account-deletions/route.ts). Calling it
 * an extra time is harmless: it only finalizes deletion requests already
 * past their window.
 *
 * Usage: SMOKE_TEST_URL=https://polyglot.vercel.app CRON_SECRET=... node scripts/smoke-test.mjs
 */

const baseUrl = process.env.SMOKE_TEST_URL;
const cronSecret = process.env.CRON_SECRET;

if (!baseUrl) {
  console.error("SMOKE_TEST_URL is required.");
  process.exit(1);
}
if (!cronSecret) {
  console.error(
    "CRON_SECRET is required (the real production value, from the GitHub production Environment).",
  );
  process.exit(1);
}

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(
      `FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    failures.push(name);
  }
}

async function main() {
  await check("production URL responds with the landing page", async () => {
    const response = await fetch(baseUrl, { redirect: "manual" });
    if (response.status !== 200) {
      throw new Error(`expected 200, got ${response.status}`);
    }
  });

  await check("authentication entry point renders", async () => {
    const response = await fetch(new URL("/sign-in", baseUrl), {
      redirect: "manual",
    });
    if (response.status !== 200) {
      throw new Error(`expected 200, got ${response.status}`);
    }
  });

  await check(
    "protected route enforcement works (signed-out /dashboard redirects)",
    async () => {
      const response = await fetch(new URL("/dashboard", baseUrl), {
        redirect: "manual",
      });
      if (![302, 307].includes(response.status)) {
        throw new Error(
          `expected a redirect (302/307), got ${response.status}`,
        );
      }
    },
  );

  await check("a database-backed application request succeeds", async () => {
    const response = await fetch(
      new URL("/api/cron/finalize-account-deletions", baseUrl),
      {
        headers: { Authorization: `Bearer ${cronSecret}` },
      },
    );
    if (response.status !== 200) {
      throw new Error(`expected 200, got ${response.status}`);
    }
    const body = await response.json();
    if (typeof body.processedCount !== "number") {
      throw new Error(
        `expected a processedCount in the response, got ${JSON.stringify(body)}`,
      );
    }
  });

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} smoke check(s) failed: ${failures.join(", ")}`,
    );
    process.exit(1);
  }
  console.log("\nAll smoke checks passed.");
}

main();
