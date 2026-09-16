import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded } from "../support/e2e-state";

/**
 * Spec 22's mobile Chromium smoke test (~390x844, set by the
 * "mobile-chromium" project in playwright.config.ts). One representative
 * authenticated flow — not a duplicate of the full desktop suite.
 */
test.describe("Mobile smoke", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
  });

  test("dashboard renders, primary navigation works, no horizontal overflow", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Reviews" }).click();
    await expect(page).toHaveURL(/\/reviews/);

    const reviewsOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(reviewsOverflow).toBeLessThanOrEqual(1);
  });
});
