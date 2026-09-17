import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded, getFixtureIds } from "../support/e2e-state";

/**
 * Spec 22's "Critical Flow — Admin Publication": Pending -> explicit
 * administrator publication -> learner-visible. Uses the isolated "Admin
 * Test Content" fixture item — never the real launch curriculum.
 */
test.describe("Admin curriculum publication", () => {
  test("admin publishes a pending item and it becomes visible to the learner", async ({
    browser,
  }) => {
    await ensureLearnerOnboarded();
    const fixture = await getFixtureIds();

    const adminContext = await browser.newContext({
      storageState: "playwright/.auth/admin.json",
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin/curriculum/review");
    const pendingRow = adminPage.locator("li", { hasText: "amarillo" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Publish" }).click();
    await expect(pendingRow).toHaveCount(0);
    await adminContext.close();

    const learnerContext = await browser.newContext({
      storageState: "playwright/.auth/learner.json",
    });
    const learnerPage = await learnerContext.newPage();
    await learnerPage.goto(`/items/${fixture.pendingItemId}`);
    await expect(learnerPage.getByText("amarillo").first()).toBeVisible();
    await learnerContext.close();
  });
});
