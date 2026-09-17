import { expect, test } from "@playwright/test";

import { resetLearnerToNewAccountState } from "../support/e2e-state";

/**
 * Spec 22's "Critical Flow — New Learner": authenticated learner ->
 * onboarding -> Spanish selection (the only language v1 offers, so
 * onboarding never asks — it simply becomes active on completion) ->
 * curriculum preference -> dashboard.
 */
test.describe("New Learner flow", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    // Force the "just signed up" starting point regardless of what any
    // earlier spec left the shared learner in (spec 22's Parallelism rule).
    await resetLearnerToNewAccountState();
  });

  test("completes onboarding, sets a curriculum preference, and reaches the dashboard", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(
      page.getByRole("heading", { name: "Welcome to Polyglot" }),
    ).toBeVisible();

    // Five slides total; the final one swaps "Next" for "Start Now!".
    // `exact: true` — Next.js's own dev-tools button is also named "Open
    // Next.js Dev Tools", which otherwise matches "Next" as a substring.
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.getByRole("button", { name: "Start Now!" }).click();

    // Onboarding completion redirects straight into the curriculum
    // preference screen — the second half of the same first-run flow.
    // Generous timeout: this is `next dev`'s first-ever hit on this route
    // in a fresh E2E run, so it pays a real compile cost on top of the
    // completion mutation itself.
    await expect(page).toHaveURL(/\/onboarding\/curriculum/, {
      timeout: 15_000,
    });
    // The radio input is visually `sr-only` (its wrapping <label> carries
    // the visible styling), so a normal click is intercepted by the label
    // covering it at that position — force targets the accessible element
    // itself, still a real click/change event on the correct control.
    await page
      .getByRole("radio", { name: /Default Order/ })
      .click({ force: true });
    await page.getByRole("button", { name: "Start learning" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // The seeded fixture curriculum is what makes the dashboard useful for
    // a brand-new learner: lessons should be available immediately.
    await expect(page.getByText(/lesson/i).first()).toBeVisible();
  });
});
