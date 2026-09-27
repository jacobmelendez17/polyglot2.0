import { expect, test } from "@playwright/test";

import { resetLearnerToNewAccountState } from "../support/e2e-state";

/**
 * Spec 22's "Critical Flow — New Learner": authenticated learner ->
 * onboarding slides (v2, 2026-09-27) -> language choice (Spanish is the only
 * language v1 offers, so it is preselected) -> curriculum preference ->
 * dashboard.
 *
 * Navigation locks while a slide transition runs (up to ~1s for the melt into
 * the finale), so every step waits it out rather than racing the lock.
 */
const TRANSITION_MS = 1100;

const heading = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("heading", { level: 1, name });

test.describe("New Learner flow", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    // Force the "just signed up" starting point regardless of what any
    // earlier spec left the shared learner in (spec 22's Parallelism rule).
    await resetLearnerToNewAccountState();
  });

  test("walks all four slides, then language and curriculum, and reaches the dashboard", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await expect(heading(page, "Establish a foundation")).toBeVisible();

    // `exact: true` — Next.js's own dev-tools button is also named "Open
    // Next.js Dev Tools", which otherwise matches "Next" as a substring.
    for (const title of ["Immerse yourself", "Customization", "Have fun!"]) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(heading(page, title)).toBeVisible();
      await page.waitForTimeout(TRANSITION_MS);
    }

    // The finish button gently "breathes", so skip Playwright's stability wait.
    await page
      .getByRole("button", { name: "Start learning" })
      .click({ force: true });

    // Completion continues into the language choice (Spanish preselected),
    // then the curriculum preference, then the app.
    await expect(page).toHaveURL(/\/onboarding\/language/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/onboarding\/curriculum/, {
      timeout: 15_000,
    });
    // The radio input is visually `sr-only` (its wrapping <label> carries
    // the visible styling), so a normal click is intercepted by the label
    // covering it — force targets the accessible element itself.
    await page
      .getByRole("radio", { name: /Default Order/ })
      .click({ force: true });
    await page.getByRole("button", { name: "Start learning" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/lesson/i).first()).toBeVisible();
  });

  test("keyboard only: arrows navigate, Skip jumps to the finale", async ({
    page,
  }) => {
    await page.goto("/onboarding");
    await page.keyboard.press("ArrowRight");
    await expect(heading(page, "Immerse yourself")).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).focus();
    await page.keyboard.press("Enter");
    await expect(heading(page, "Have fun!")).toBeVisible();
    // Skip only moves; it never completes onboarding on its own.
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("reduced motion still reaches every slide", async ({ browser }) => {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      storageState: "playwright/.auth/learner.json",
    });
    const page = await context.newPage();
    await page.goto("/onboarding");
    for (const title of ["Immerse yourself", "Customization", "Have fun!"]) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(heading(page, title)).toBeVisible();
      await page.waitForTimeout(400);
    }
    await context.close();
  });
});
