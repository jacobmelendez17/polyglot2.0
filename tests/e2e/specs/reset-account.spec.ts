import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded, getLearnerId, makeVocabularyItemDue } from "../support/e2e-state";
import { withE2EDb } from "../support/e2e-db";
import { clickRespectingDangerZoneRateLimit } from "../support/rate-limit";
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

    const openDialogButton = page.getByRole("button", { name: "Reset Account" });
    const confirmInput = page.getByLabel(/Type RESET to confirm/);

    // Every page (via AppLayout's AppHeader) mounts Clerk's <UserButton>, which
    // can intermittently hydration-mismatch right after a fresh navigation in
    // this E2E auth flow (the dev-browser JWT that `@clerk/testing` activates
    // client-side isn't available to the SSR pass) — React then "regenerates"
    // the whole tree client-side per its own hydration-failure recovery. If
    // that remount lands between this click and the dialog mounting, the
    // click is lost on the button that just got torn down. Confirmed via
    // `[browser] Uncaught Error: Hydration failed...` in the dev server log
    // on the run that produced this exact timeout. Retrying once is enough:
    // the remount is a one-time recovery, not a recurring condition.
    await openDialogButton.click();
    const dialogOpened = await confirmInput
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!dialogOpened) {
      await openDialogButton.click();
    }
    await confirmInput.fill("RESET");
    // Shares Danger Zone's tightest rate-limit budget with Delete Account's
    // request/confirm/cancel (see rate-limit.ts) — a neighboring spec using
    // the same permanent E2E learner can leave it exhausted.
    await clickRespectingDangerZoneRateLimit(page, page.getByRole("dialog").getByRole("button", { name: "Reset Account" }));

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });

    const [user] = await withE2EDb((db) => db.select().from(users).where(eq(users.id, learnerId)));
    expect(user!.onboardingCompletedAt).toBeNull();

    const progress = await withE2EDb((db) => db.select().from(userItemProgress).where(eq(userItemProgress.userId, learnerId)));
    expect(progress).toHaveLength(0);
  });
});
