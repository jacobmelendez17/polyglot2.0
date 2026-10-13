import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded, getFixtureIds } from "../support/e2e-state";

/**
 * Spec 22's "Critical Flow — Admin Publication": Pending -> explicit
 * administrator publication -> learner-visible. Uses the isolated "Admin
 * Test Content" fixture item — never the real launch curriculum.
 *
 * Spec 26 Unit 3 moved the review queue onto React Admin, and publishing now
 * asks for confirmation first: the queue's own behaviour (roles, stale
 * versions, idempotency, paging) is covered in `admin-review.spec.ts`; this
 * file keeps the one end-to-end promise that matters to a learner.
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

    const queue = adminPage.getByRole("table", { name: "Review queue" });
    const pendingRow = queue.getByRole("row").filter({ hasText: "amarillo" });
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole("button", { name: "Publish amarillo" }).click();

    // Nothing is published until the Admin confirms what will happen.
    const dialog = adminPage.getByRole("dialog", {
      name: "Publish “amarillo”?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Publish", exact: true }).click();

    await expect(dialog).toHaveCount(0);
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
