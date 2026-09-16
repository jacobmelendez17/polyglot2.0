import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded, getLearnerId, makeVocabularyItemDue } from "../support/e2e-state";
import { withE2EDb } from "../support/e2e-db";
import { userItemProgress, users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Spec 22's "Critical Flow — Reset Entire Account". Safe here because it
 * runs only against the dedicated E2E learner and E2E database.
 */
test.describe("Reset Entire Account", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
    await makeVocabularyItemDue("gato", "master"); // representative existing progress
  });

  test("resets progress and onboarding, returning the learner to onboarding", async ({ page }) => {
    const learnerId = await getLearnerId();

    await page.goto("/settings/danger");
    await page.getByRole("button", { name: "Reset Account" }).click();
    await page.getByLabel(/Type RESET to confirm/).fill("RESET");
    await page.getByRole("dialog").getByRole("button", { name: "Reset Account" }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });

    const [user] = await withE2EDb((db) => db.select().from(users).where(eq(users.id, learnerId)));
    expect(user!.onboardingCompletedAt).toBeNull();

    const progress = await withE2EDb((db) => db.select().from(userItemProgress).where(eq(userItemProgress.userId, learnerId)));
    expect(progress).toHaveLength(0);
  });
});
