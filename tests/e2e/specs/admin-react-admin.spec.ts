import { expect, test, type Page } from "@playwright/test";

import { getE2EAdminStatusCounts, setE2EAdminRole } from "../support/e2e-admin";

/**
 * Spec 26 Unit 1 — the Admin Overview, rendered through React Admin, against
 * the real signed-in app and the isolated E2E database.
 *
 * Roles other than admin are exercised by flipping the permanent E2E admin
 * identity's *database* role (see `support/e2e-admin.ts`) and restoring it
 * afterwards, which is exactly what the server's own checks read.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;

test.use({ storageState: ADMIN_AUTH });

test.afterEach(async () => {
  await setE2EAdminRole("admin");
});

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Waits for the lazily loaded React Admin screen to finish loading its data. */
async function overviewReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function statValue(page: Page, label: string): Promise<number> {
  const card = page
    .getByLabel("Curriculum status counts")
    .locator("div", { has: page.getByText(label, { exact: true }) })
    .first();
  return Number(await card.getByRole("definition").innerText());
}

test.describe("Admin Overview (admin)", () => {
  test("renders live, language-scoped counts and every shortcut", async ({
    page,
  }) => {
    const overviewResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/admin/overview"),
    );
    const meResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/admin/me"),
    );

    await page.goto("/admin");
    await overviewReady(page);

    expect((await overviewResponse).status()).toBe(200);
    expect((await meResponse).status()).toBe(200);

    // The numbers on screen are the database's, from an independent query.
    const expected = await getE2EAdminStatusCounts();
    expect(await statValue(page, "Published")).toBe(expected.published);
    expect(await statValue(page, "Pending")).toBe(expected.pending);
    expect(await statValue(page, "Draft")).toBe(expected.draft);
    expect(await statValue(page, "Archived")).toBe(expected.archived);

    const shortcuts = page.getByLabel("Admin shortcuts");
    await expect(shortcuts.getByRole("link")).toHaveText([
      /Curriculum/,
      /Logs/,
      /Sandbox/,
    ]);

    // Next owns the URL: no `/admin#/...` hash route, ever.
    await expect(page).toHaveURL(/\/admin$/);
    await shot(page, "overview-admin-light");
  });

  test("keeps canonical Next URLs through shortcut navigation and Back", async ({
    page,
  }) => {
    await page.goto("/admin");
    await overviewReady(page);

    await page
      .getByLabel("Admin shortcuts")
      .getByRole("link", { name: /Curriculum/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/curriculum$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/admin$/);
    await overviewReady(page);
    await expect(page.getByLabel("Curriculum status counts")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });

  test("is operable by keyboard alone", async ({ page }) => {
    await page.goto("/admin");
    await overviewReady(page);

    const curriculum = page
      .getByLabel("Admin shortcuts")
      .getByRole("link", { name: /Curriculum/ });
    await curriculum.focus();
    await expect(curriculum).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/curriculum$/);
  });
});

test.describe("Admin Overview (other roles)", () => {
  test("a writer sees counts and Curriculum only", async ({ page }) => {
    await setE2EAdminRole("writer");
    await page.goto("/admin");
    await overviewReady(page);

    await expect(page.getByLabel("Curriculum status counts")).toBeVisible();
    const shortcuts = page.getByLabel("Admin shortcuts");
    await expect(shortcuts.getByRole("link")).toHaveText([/Curriculum/]);
    await expect(shortcuts.getByRole("link", { name: /Logs/ })).toHaveCount(0);
    await expect(shortcuts.getByRole("link", { name: /Sandbox/ })).toHaveCount(
      0,
    );

    const me = await page.request.get("/api/v1/admin/me");
    expect((await me.json()).data.permissions).toMatchObject({
      canManageCurriculum: true,
      canPublishCurriculum: false,
      canUseDeveloperTools: false,
    });
    await shot(page, "overview-writer");
  });

  test("a developer sees the operational tools and no curriculum data", async ({
    page,
  }) => {
    await setE2EAdminRole("developer");
    await page.goto("/admin");
    await overviewReady(page);

    const shortcuts = page.getByLabel("Admin shortcuts");
    await expect(shortcuts.getByRole("link")).toHaveText([/Logs/, /Sandbox/]);
    await expect(page.getByLabel("Curriculum status counts")).toHaveCount(0);

    // The server withheld the data; it was not merely hidden by the UI.
    const overview = await page.request.get("/api/v1/admin/overview");
    expect((await overview.json()).data.curriculum).toBeNull();
    await shot(page, "overview-developer");
  });

  test("a role revoked while the page stays open is denied on the next request", async ({
    page,
  }) => {
    await page.goto("/admin");
    await overviewReady(page);
    await expect(page.getByLabel("Curriculum status counts")).toBeVisible();

    await setE2EAdminRole("user");

    // The browser regains focus, as it would after the tab sat in the
    // background — React Query re-asks the server, which re-reads the role.
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    // (Next's own route announcer is also role="alert", so match by text.)
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "You don't have access to this part" }),
    ).toBeVisible();
    // Stale privileged data is gone, not merely joined by a warning.
    await expect(page.getByLabel("Curriculum status counts")).toHaveCount(0);
    await expect(page.getByLabel("Admin shortcuts")).toHaveCount(0);
    await shot(page, "overview-revoked");
  });
});

test.describe("Admin API — direct access, without the page", () => {
  test("answers 200 for an admin, with an uncacheable response", async ({
    request,
  }) => {
    const me = await request.get("/api/v1/admin/me");
    expect(me.status()).toBe(200);
    expect(me.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    const { data } = await me.json();
    expect(data.role).toBe("admin");
    expect(Object.keys(data).sort()).toEqual(["id", "permissions", "role"]);

    expect((await request.get("/api/v1/admin/overview")).status()).toBe(200);
  });

  test("answers 403 — never an empty success — for a signed-in learner", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: LEARNER_AUTH });
    for (const path of ["/api/v1/admin/me", "/api/v1/admin/overview"]) {
      const response = await context.request.get(path);
      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body).not.toHaveProperty("data");
    }
    await context.close();
  });

  test("answers 401 with no session at all", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    for (const path of ["/api/v1/admin/me", "/api/v1/admin/overview"]) {
      const response = await context.request.get(path);
      expect(response.status()).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    }
    await context.close();
  });

  test("a revoked role is refused on the very next call", async ({
    request,
  }) => {
    expect((await request.get("/api/v1/admin/me")).status()).toBe(200);
    await setE2EAdminRole("user");
    expect((await request.get("/api/v1/admin/me")).status()).toBe(403);
    expect((await request.get("/api/v1/admin/overview")).status()).toBe(403);
  });
});

test.describe("Admin Overview — appearance", () => {
  test("follows the dark theme through the app's own CSS variables", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/admin");
    await overviewReady(page);
    await expect(page.locator("html")).toHaveClass(/dark/);

    // A Material UI card must paint with the same colour `--bg-surface`
    // resolves to — i.e. Polyglot's dark surface, not MUI's own default.
    const { card, surface } = await page.evaluate(() => {
      const target = document.querySelector(
        '[aria-label="Curriculum status counts"] > div',
      ) as HTMLElement;
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--bg-surface)";
      document.body.appendChild(probe);
      const result = {
        card: getComputedStyle(target).backgroundColor,
        surface: getComputedStyle(probe).backgroundColor,
      };
      probe.remove();
      return result;
    });
    expect(card).toBe(surface);
    await shot(page, "overview-admin-dark");
  });

  test("lays out at 390px without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await overviewReady(page);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByLabel("Curriculum status counts")).toBeVisible();
    await shot(page, "overview-admin-mobile");
  });
});
