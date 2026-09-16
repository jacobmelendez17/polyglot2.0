import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded } from "../support/e2e-state";

/**
 * Spec 22's Authentication E2E flows. Each `test.use({ storageState })`
 * block below is independent — no test depends on another having run
 * first, per spec 22's Parallelism rule.
 */

test.describe("signed-out route protection", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a signed-out browser visiting a protected route is redirected to sign-in", async ({ page }) => {
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

  test("can reach dashboard, lessons, reviews, and settings", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard/);

    await page.goto("/lessons");
    await expect(page).not.toHaveURL(/sign-in/);

    await page.goto("/reviews");
    await expect(page).not.toHaveURL(/sign-in/);

    await page.goto("/settings");
    await expect(page).not.toHaveURL(/sign-in/);
  });

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

  test("can sign out and loses access to protected pages", async ({ page }) => {
    await page.goto("/dashboard");
    await clerk.signOut({ page });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
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
