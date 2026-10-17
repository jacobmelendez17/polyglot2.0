import { expect, test, type Page } from "@playwright/test";

import { ANALYTICS_POLICY_VERSION } from "@/domains/analytics";

import {
  ensureLearnerOnboarded,
  readLearnerAnalyticsConsent,
  resetLearnerAnalyticsConsent,
  storeLearnerAcceptanceForOlderNotice,
} from "../support/e2e-state";

/**
 * Spec 27 Unit 27.2 — Settings → Privacy: the analytics consent switch.
 *
 * The point of these tests is that **the server holds the choice**: every
 * assertion about what was saved reads the database, not the page, and a second
 * "device" is a second browser context for the same signed-in learner. Nothing
 * here sends an analytics event — Unit 27.3 is what could — so the proof that
 * capture stays closed is the stored state the capture gate reads.
 */

const AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PATH = "/settings/privacy";

test.describe("Settings → Privacy", () => {
  test.use({ storageState: AUTH });

  test.beforeEach(async () => {
    await ensureLearnerOnboarded();
    await resetLearnerAnalyticsConsent();
  });

  test.afterAll(async () => {
    await resetLearnerAnalyticsConsent();
  });

  const switchOf = (page: Page) =>
    page.getByRole("switch", { name: "Share anonymous usage analytics" });
  const save = (page: Page) =>
    page.getByRole("button", { name: "Save", exact: true });
  const saved = (page: Page) => page.getByText("Saved", { exact: true });

  async function shot(page: Page, name: string): Promise<void> {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }

  async function open(page: Page): Promise<void> {
    await page.goto(PATH);
    await expect(
      page.getByRole("heading", { name: "Usage analytics" }),
    ).toBeVisible();
  }

  test("starts off, is chosen and saved from the keyboard alone, and is held by the server rather than the browser", async ({
    page,
    browser,
  }) => {
    await open(page);

    // Off for someone who has never chosen, with the controls on screen but idle.
    await expect(switchOf(page)).not.toBeChecked();
    await expect(save(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(await readLearnerAnalyticsConsent()).toBeNull();
    await shot(page, "privacy-off");

    // Keyboard only: focus the switch, Space turns it on, Tab reaches Save,
    // Enter saves. Choosing alone saves nothing.
    await switchOf(page).focus();
    await page.keyboard.press("Space");
    await expect(switchOf(page)).toBeChecked();
    await expect(save(page)).toBeEnabled();
    expect(await readLearnerAnalyticsConsent()).toBeNull();
    await page.keyboard.press("Tab");
    await expect(save(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(saved(page)).toBeVisible();
    await shot(page, "privacy-on");

    // What the server stored: an acceptance, with the pseudonym it needs.
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "accepted",
      revision: 1,
      hasAnalyticsId: true,
    });

    // Not in this browser: no analytics or consent key in any of its storage.
    const storageKeys = await page.evaluate(() => [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
      document.cookie,
    ]);
    expect(storageKeys.join(" ")).not.toMatch(/analytics|consent/i);

    // It holds after a reload and on another device (a fresh browser context).
    await page.reload();
    await expect(switchOf(page)).toBeChecked();
    const otherDevice = await browser.newContext({ storageState: AUTH });
    const otherPage = await otherDevice.newPage();
    await open(otherPage);
    await expect(switchOf(otherPage)).toBeChecked();
    await otherDevice.close();

    // Withdrawing is as direct, and keeps the pseudonym.
    await switchOf(page).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "declined",
      revision: 2,
      hasAnalyticsId: true,
    });
    await page.reload();
    await expect(switchOf(page)).not.toBeChecked();
  });

  test("a device with an out-of-date view cannot turn analytics back on, but can always turn them off", async ({
    page,
    browser,
  }) => {
    // Device B opens Settings first, and sees that nothing has been chosen.
    const deviceB = await browser.newContext({ storageState: AUTH });
    const pageB = await deviceB.newPage();
    await open(pageB);
    await expect(switchOf(pageB)).not.toBeChecked();

    // Device A accepts, then withdraws.
    await open(page);
    await switchOf(page).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    await switchOf(page).click();
    await save(page).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "declined",
      revision: 2,
    });

    // B, still showing its old view, tries to switch analytics on. The server
    // refuses to let an out-of-date page overwrite the newer decision.
    await switchOf(pageB).click();
    await save(pageB).click();
    await expect(pageB.getByText(/changed on another device/)).toBeVisible();
    await shot(pageB, "privacy-stale-device");
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "declined",
      revision: 2,
    });

    // A fresh look shows the real state, and B can then choose on purpose.
    await pageB.reload();
    await expect(switchOf(pageB)).not.toBeChecked();
    await switchOf(pageB).click();
    await save(pageB).click();
    await expect(saved(pageB)).toBeVisible();
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "accepted",
      revision: 3,
    });

    // The other way round. A refreshes and sees the acceptance B just made ...
    await open(page);
    await expect(switchOf(page)).toBeChecked();
    // ... B withdraws, so A's page is now showing an "on" that is no longer true ...
    await switchOf(pageB).click();
    await save(pageB).click();
    await expect(saved(pageB)).toBeVisible();
    // ... and switching it off from that out-of-date page still works: stopping
    // never needs the current view.
    await switchOf(page).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "declined",
      revision: 4,
    });

    await deviceB.close();
  });

  test("asks the learner to choose again when the wording has changed since they accepted", async ({
    page,
  }) => {
    await storeLearnerAcceptanceForOlderNotice("2020-01-01");

    await open(page);

    // An acceptance under an older notice no longer counts, and the page says so.
    await expect(
      page.getByText(/The wording on this page changed/),
    ).toBeVisible();
    await expect(switchOf(page)).not.toBeChecked();
    await shot(page, "privacy-needs-review");

    await switchOf(page).click();
    await save(page).click();
    await expect(saved(page)).toBeVisible();
    expect(await readLearnerAnalyticsConsent()).toMatchObject({
      status: "accepted",
      revision: 5,
      policyVersion: ANALYTICS_POLICY_VERSION,
      hasAnalyticsId: true,
    });
    await page.reload();
    await expect(
      page.getByText(/The wording on this page changed/),
    ).toHaveCount(0);
    await expect(switchOf(page)).toBeChecked();
  });

  test("is reachable from the Settings navigation, follows the dark theme, and lays out at 390px without scrolling sideways", async ({
    page,
  }) => {
    await page.goto("/settings/general");
    const nav = page.getByRole("navigation", { name: "Settings" });
    await nav.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/settings\/privacy$/);
    await expect(nav.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(switchOf(page)).toBeVisible();
    await shot(page, "privacy-dark");

    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(switchOf(page)).toBeInViewport();
    await shot(page, "privacy-mobile");

    // On a phone the sections live in a sheet, and Privacy is among them.
    await page
      .getByRole("button", { name: "Open Settings navigation" })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("navigation", { name: "Settings" })
        .getByRole("link", { name: "Privacy" }),
    ).toBeVisible();
  });
});
