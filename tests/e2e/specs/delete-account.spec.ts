import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded } from "../support/e2e-state";
import { clickRespectingDangerZoneRateLimit } from "../support/rate-limit";

/**
 * Spec 22's "Critical Flow — Delete Account Request". The repeatable E2E
 * suite must never permanently destroy its shared Clerk identity — this
 * flow only ever reaches "pending deletion" before cancelling.
 */
test.describe("Delete Account request and cancellation", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
  });

  test("request -> confirm -> pending deletion -> cancel -> normal account state restored", async ({ page }) => {
    await page.goto("/settings/danger");

    await page.getByRole("button", { name: "Start Account Deletion" }).click();
    await expect(page.getByText(/pending confirmation/i)).toBeVisible();

    await page.getByRole("button", { name: "Confirm Account Deletion" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Type DELETE to confirm/).fill("DELETE");
    await dialog.getByRole("button", { name: "Confirm Account Deletion" }).click();

    await expect(page.getByRole("button", { name: "Cancel Account Deletion" })).toBeVisible();

    // Request/confirm/cancel share Danger Zone's tightest rate-limit policy
    // (2 requests/60s) — this flow's own request+confirm already spends
    // that budget, so the third (cancel) call is expected to be rejected
    // once. See rate-limit.ts for why this waits rather than loosening it.
    await clickRespectingDangerZoneRateLimit(page, page.getByRole("button", { name: "Cancel Account Deletion" }));

    await expect(page.getByRole("button", { name: "Start Account Deletion" })).toBeVisible();
  });
});
