import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

/**
 * Spec 22's "Authentication Strategy" — generates stored authenticated
 * browser states for the two permanent, non-production Clerk identities
 * (`Polyglot E2E Learner`, `Polyglot E2E Admin`) once per Playwright run,
 * via `@clerk/testing`'s emailAddress sign-in form. This mints a real
 * session through `CLERK_SECRET_KEY` — no password is stored anywhere, and
 * the normal Clerk sign-in UI (Cloudflare Turnstile-gated) is never
 * automated (spec 22's "Signup Scope").
 *
 * Runs as Playwright's "setup" project (playwright.config.ts), before every
 * other project that declares it as a dependency, so ordinary specs load an
 * already-authenticated `storageState` instead of repeating this.
 */

const LEARNER_AUTH_FILE = "playwright/.auth/learner.json";
const ADMIN_AUTH_FILE = "playwright/.auth/admin.json";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to generate E2E auth state. Set it in .env.local — see .env.example.`);
  return value;
}

setup("authenticate as the E2E learner", async ({ page }) => {
  await clerkSetup();
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded));
  await clerk.signIn({ page, emailAddress: requiredEnv("E2E_LEARNER_EMAIL") });
  await page.goto("/dashboard");
  await page.context().storageState({ path: LEARNER_AUTH_FILE });
});

setup("authenticate as the E2E admin", async ({ page }) => {
  await clerkSetup();
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded));
  await clerk.signIn({ page, emailAddress: requiredEnv("E2E_ADMIN_EMAIL") });
  // /admin, not /dashboard: the admin identity never completes onboarding
  // (there is no learner-facing reason for it to), and architecture.md
  // deliberately leaves /admin ungated so an administrator can always reach
  // it regardless of onboarding state.
  await page.goto("/admin");
  await page.context().storageState({ path: ADMIN_AUTH_FILE });
});
