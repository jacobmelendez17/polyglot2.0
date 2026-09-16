import { expect, test } from "@playwright/test";

import { ensureLearnerOnboarded } from "../support/e2e-state";

/**
 * Spec 22's "Critical Flow — Settings Persistence". Timezone is the
 * representative authoritative server-persisted setting: unlike Appearance
 * (spec 20's one deliberate device-local exception), it is a real database
 * column, so persistence here proves server-backed state, not a
 * `localStorage` illusion.
 */
test.describe("Settings persistence", () => {
  test.use({ storageState: "playwright/.auth/learner.json" });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
  });

  test("changing timezone persists across refresh and a fresh browser context", async ({ page, browser }) => {
    await page.goto("/settings/general");

    await page.getByRole("combobox", { name: /Timezone/ }).click();
    // The list is searched against the raw IANA identifier text (e.g.
    // "America/Mexico_City"), which has no space — "Mexico City" would
    // match nothing.
    await page.getByLabel("Search timezones").fill("Mexico_City");
    await page.getByRole("option", { name: /America\/Mexico_City/ }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("combobox", { name: /Timezone, America\/Mexico_City/ })).toBeVisible();

    // A fresh browser context for the same authenticated learner — proves
    // the value is server-backed rather than device-local.
    const freshContext = await browser.newContext({ storageState: "playwright/.auth/learner.json" });
    const freshPage = await freshContext.newPage();
    await freshPage.goto("/settings/general");
    await expect(freshPage.getByRole("combobox", { name: /Timezone, America\/Mexico_City/ })).toBeVisible();
    await freshContext.close();
  });
});
