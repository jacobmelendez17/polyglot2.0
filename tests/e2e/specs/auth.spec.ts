import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded } from "../support/e2e-state";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is required. Set it in .env.local — see .env.example.`,
    );
  return value;
}

/**
 * Spec 22's Authentication E2E flows. Each `test.use({ storageState })`
 * block below is independent — no test depends on another having run
 * first, per spec 22's Parallelism rule.
 */

test.describe("signed-out route protection", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a signed-out browser visiting a protected route is redirected to sign-in", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });
});

test.describe("authenticated learner", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });
  test.beforeAll(async () => {
    // This describe block tests ordinary access, not onboarding itself
    // (that's onboarding.spec.ts) — force the baseline onboarded state
    // regardless of what an earlier spec left the shared learner in.
    await ensureLearnerOnboarded();
  });

  test("can reach dashboard, lessons, reviews, and settings", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard/);

    await page.goto("/lessons");
    await expect(page).not.toHaveURL(/sign-in/);

    await page.goto("/reviews");
    await expect(page).not.toHaveURL(/sign-in/);

    await page.goto("/settings");
    await expect(page).not.toHaveURL(/sign-in/);
  });

  // Clerk's own <UserButton> menu: its "Manage account" entry is relabelled
  // "Settings" (lib/clerk-localization.ts) and opens this app's Settings, in
  // both the signed-in app header and the signed-in marketing header.
  for (const [startPage, header] of [
    ["/dashboard", "app header"],
    ["/", "landing-page header"],
  ] as const) {
    test(`the ${header}'s account menu offers Settings instead of Manage account, and opens this app's Settings`, async ({
      page,
    }) => {
      await page.goto(startPage);

      // Lead with a polling expect, not a bare click: right after a fresh
      // navigation the <UserButton> can remount once (see reset-account.spec).
      const trigger = page.getByRole("button", { name: "Open user menu" });
      await expect(trigger).toBeVisible();
      // Clerk renders the menu entries as plain buttons inside this dialog.
      const menu = page.getByRole("dialog", { name: "Account panel" });
      const settings = menu.getByRole("button", {
        name: "Settings",
        exact: true,
      });
      await expect(async () => {
        if (!(await menu.isVisible())) await trigger.click();
        await expect(settings).toBeVisible({ timeout: 2_000 });
      }).toPass();

      await expect(
        menu.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeVisible();
      await expect(menu.getByText("Manage account")).toHaveCount(0);

      await settings.click();
      await expect(page).toHaveURL(/\/settings\/account$/);
    });
  }

  test("is denied access to the Admin area", async ({ page }) => {
    const response = await page.goto("/admin");
    // Next.js's forbidden() boundary (app/(admin)/forbidden.tsx) renders in
    // place at a 403 status rather than redirecting — either outcome proves
    // the learner never sees Admin content, so accept both.
    if (response) {
      expect([403, 200]).toContain(response.status());
    }
    await expect(page.getByRole("heading", { name: /admin/i })).toHaveCount(0);
  });
});

test.describe("sign out", () => {
  // Deliberately not the shared `learner.json` storageState: `clerk.signOut`
  // revokes the underlying Clerk session, not just this page's cookies, and
  // every other spec in the suite reuses that same saved session. Signing
  // in fresh here (and never saving the result) keeps that destructive
  // action scoped to this one test.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a signed-in learner can sign out and loses access to protected pages", async ({
    page,
  }) => {
    await clerkSetup();
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.Clerk?.loaded));
    await clerk.signIn({
      page,
      emailAddress: requiredEnv("E2E_LEARNER_EMAIL"),
    });

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/sign-in/);

    await clerk.signOut({ page });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);

    // Defensive: if Clerk's sign-out ever turns out to revoke every session
    // for this user rather than only this page's, every other spec's
    // `playwright/.auth/learner.json` would otherwise die with it — so
    // re-establish a good one immediately, regardless of which behavior
    // Clerk actually implements.
    await clerk.signIn({
      page,
      emailAddress: requiredEnv("E2E_LEARNER_EMAIL"),
    });
    await page.goto("/dashboard");
    await page
      .context()
      .storageState({ path: "playwright/.auth/learner.json" });
  });
});

test.describe("administrator", () => {
  test.use({ storageState: "playwright/.auth/admin.json" });

  test("is allowed into the Admin area", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
  });
});
