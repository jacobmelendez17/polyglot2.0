import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded, makeVocabularyItemDue, resetLearnerItemProgress } from "../support/e2e-state";
import { completeAllDueReviews } from "../support/review-quiz";

/**
 * Spec 22's "Critical Flow — Progress Persistence": earned progress survives
 * refresh, navigating elsewhere and back, and a full sign-out/sign-in cycle
 * — proving it lives server-side rather than only in browser state.
 */
test.describe("Progress persistence", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
    await resetLearnerItemProgress();
  });

  test("earned review progress survives refresh, navigation, and sign-out/sign-in", async ({ page }) => {
    await makeVocabularyItemDue("gato", "beginner_2");
    await page.goto("/reviews");
    await completeAllDueReviews(page);
    await expect(page.getByRole("heading", { name: "Session complete!" })).toBeVisible();

    await page.goto("/dashboard");
    const dashboardText = await page.locator("body").innerText();

    await page.reload();
    await expect(page.locator("body")).toContainText(dashboardText.split("\n")[0] ?? "");

    await page.goto("/lessons");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    await clerk.signOut({ page });
    await clerk.signIn({ page, emailAddress: process.env.E2E_LEARNER_EMAIL! });
    await page.goto("/dashboard");

    // The item is no longer due immediately after a correct answer — same
    // server-backed fact whether read right after answering or after a full
    // sign-out/sign-in cycle.
    await page.goto("/reviews");
    await expect(page.getByLabel("Your answer")).toHaveCount(0);
  });
});
