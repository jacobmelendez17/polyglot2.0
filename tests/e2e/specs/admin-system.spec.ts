import { expect, test, type Page } from "@playwright/test";

import { setE2EAdminRole } from "../support/e2e-admin";
import { lowestTextContrast, textContrast } from "../support/contrast";
import { renewSession } from "../support/e2e-session";

/**
 * Spec 27 Unit 27.10 — the Admin Logs page's System tab and the Analytics link
 * in the Admin menu, against the real signed-in app.
 *
 * The E2E server forces every telemetry switch off (so every signal reads Off)
 * and fixes the two link settings to valid addresses on accounts that do not
 * exist (`scripts/e2e-server.ts`). Nothing here reaches the real Grafana or
 * PostHog: a test that clicks a link stubs the host first, and the page itself
 * is asserted to make no request to either. The Audit tab's own behaviour —
 * paging, filters, details, roles — is `admin-logs.spec.ts`, which also keeps
 * passing.
 *
 * Roles other than admin flip the permanent E2E admin identity's *database* role
 * and restore it after every test.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const SYSTEM = "/admin/logs?tab=system";

/** What `scripts/e2e-server.ts` sets, and so what the page must derive. */
const GRAFANA = "https://e2e-polyglot.grafana.net";
const POSTHOG = "https://us.posthog.com";
const POSTHOG_DASHBOARDS = `${POSTHOG}/project/0/dashboard`;
const GRAFANA_LINKS = [
  `${GRAFANA}/dashboards`,
  `${GRAFANA}/alerting/list`,
  `${GRAFANA}/alerting/notifications`,
  `${GRAFANA}/explore`,
  `${GRAFANA}/a/grafana-synthetic-monitoring-app/home`,
];
const POSTHOG_LINKS = [POSTHOG_DASHBOARDS, `${POSTHOG}/organization/billing`];

/** For the first visit to a route, which `next dev` compiles on demand (observed up to a minute). */
const SLOW = { timeout: 60_000 };

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial", timeout: 180_000 });

test.afterEach(async () => {
  await setE2EAdminRole("admin");
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function open(page: Page): Promise<void> {
  await page.goto(SYSTEM);
  await expect(
    page.getByRole("heading", { level: 2, name: "Telemetry on this server" }),
  ).toBeVisible(SLOW);
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Admin" });
const main = (page: Page) => page.locator("main");
const cards = (page: Page) => main(page).locator("[data-slot=card]");

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Stubs both vendors' hosts so a click-through never leaves the machine, and records what was asked. */
async function stubVendors(page: Page) {
  const asked: { url: string; referer: string | undefined }[] = [];
  await page
    .context()
    .route(
      /^https:\/\/(e2e-polyglot\.grafana\.net|us\.posthog\.com)\//,
      async (route) => {
        const request = route.request();
        asked.push({
          url: request.url(),
          referer: request.headers()["referer"],
        });
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><title>stub</title><p>stub</p>",
        });
      },
    );
  return asked;
}

/* -------------------------------------------------------------------------- */
/* Who may see it                                                             */
/* -------------------------------------------------------------------------- */

test.describe("who may see it", () => {
  test("an Admin and a developer see the System tab and the Analytics link; a writer is refused the page and offered neither; a learner and a visitor cannot open it", async ({
    page,
    browser,
  }) => {
    for (const role of ["admin", "developer"] as const) {
      await setE2EAdminRole(role);
      await open(page);
      await expect(
        sidebar(page).getByRole("link", { name: /^Analytics/ }),
        `${role}: the Analytics link`,
      ).toHaveAttribute("href", POSTHOG_DASHBOARDS);
      await expect(
        sidebar(page).getByRole("link", { name: "Logs" }),
      ).toBeVisible();
    }

    // A writer authors curriculum; the trail and the operational links are not theirs.
    await setE2EAdminRole("writer");
    expect((await page.goto(SYSTEM))?.status()).toBe(403);
    await page.goto("/admin");
    await expect(
      sidebar(page).getByRole("link", { name: "Curriculum" }),
    ).toBeVisible(SLOW);
    await expect(
      sidebar(page).getByRole("link", { name: /Analytics/ }),
    ).toHaveCount(0);
    await expect(sidebar(page).getByRole("link", { name: "Logs" })).toHaveCount(
      0,
    );

    // A learner is not in the Admin area at all…
    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    await renewSession(learnerPage);
    expect((await learnerPage.goto(SYSTEM))?.status()).toBe(403);
    await learner.close();

    // …and a visitor is sent to sign in.
    const visitor = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(SYSTEM);
    await expect(visitorPage).toHaveURL(/sign-in/);
    await visitor.close();
  });
});

/* -------------------------------------------------------------------------- */
/* What it says                                                               */
/* -------------------------------------------------------------------------- */

test.describe("what the tab says", () => {
  test("every signal reads Off on a server where telemetry is switched off, each with its switch — and says what it cannot see", async ({
    page,
  }) => {
    await open(page);

    expect(
      await main(page).getByRole("heading", { level: 3 }).allInnerTexts(),
    ).toEqual(
      expect.arrayContaining([
        "Product analytics · PostHog",
        "Metrics · Grafana Cloud",
        "Traces · Grafana Cloud",
        "Logs · Grafana Cloud",
      ]),
    );
    await expect(main(page).getByText("Off", { exact: true })).toHaveCount(4);
    await expect(main(page).getByText("Blocked", { exact: true })).toHaveCount(
      0,
    );
    for (const name of [
      "POSTHOG_ENABLED",
      "TELEMETRY_METRICS_ENABLED",
      "TELEMETRY_TRACES_ENABLED",
      "TELEMETRY_LOGS_ENABLED",
    ]) {
      await expect(main(page).getByText(name, { exact: true })).toBeVisible();
    }
    await expect(
      main(page).getByText(
        /can’t see whether PostHog or Grafana is actually receiving/,
      ),
    ).toBeVisible();
    await expect(
      main(page).getByText(
        /can’t see how much of the PostHog or Grafana allowance/,
      ),
    ).toBeVisible();
    await expect(
      main(page).getByText("/api/health/ready", { exact: true }),
    ).toBeVisible();
    await shot(page, "system-light");
  });

  test("the old placeholder is gone, and the Audit tab is still one click away", async ({
    page,
  }) => {
    await open(page);
    await expect(
      page.getByText("System log pipeline not yet wired up"),
    ).toHaveCount(0);

    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page).toHaveURL(/tab=audit/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Telemetry on this server" }),
    ).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("links", () => {
  test("the owner's pages are linked from the settings: https, a new tab, cut off from this window, said so — and the page itself asks neither vendor for anything", async ({
    page,
  }) => {
    const vendorHosts: string[] = [];
    page.on("request", (request) => {
      const { hostname } = new URL(request.url());
      if (/grafana|posthog/.test(hostname)) vendorHosts.push(hostname);
    });

    await open(page);

    const links = main(page).locator("a[target=_blank]");
    await expect(links).toHaveCount(
      GRAFANA_LINKS.length + POSTHOG_LINKS.length,
    );
    const hrefs = await links.evaluateAll((anchors) =>
      anchors.map((anchor) => anchor.getAttribute("href")),
    );
    expect(hrefs).toEqual([...GRAFANA_LINKS, ...POSTHOG_LINKS]);

    for (let index = 0; index < hrefs.length; index += 1) {
      const link = links.nth(index);
      await expect(link).toHaveAttribute("href", /^https:\/\//);
      const rel = (await link.getAttribute("rel")) ?? "";
      expect(rel).toContain("noopener");
      expect(rel).toContain("noreferrer");
      await expect(link).toHaveAccessibleName(/\(opens in a new tab\)$/);
    }
    // Nothing links anywhere else out of the application from this tab's content.
    expect(
      await main(page).locator("a[href^='http']:not([target=_blank])").count(),
    ).toBe(0);

    expect(vendorHosts, "requests to Grafana or PostHog from the page").toEqual(
      [],
    );
  });

  test("a click opens the page in a new tab that cannot reach this one and is not told where the click came from", async ({
    page,
  }) => {
    const asked = await stubVendors(page);
    await open(page);

    const opened = page.context().waitForEvent("page");
    await main(page)
      .getByRole("link", { name: /^Alert rules/ })
      .click();
    const popup = await opened;
    await popup.waitForLoadState();

    expect(popup.url()).toBe(`${GRAFANA}/alerting/list`);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(
      asked.find((entry) => entry.url === `${GRAFANA}/alerting/list`)?.referer,
    ).toBeUndefined();
    // This tab did not move.
    expect(page.url()).toContain(SYSTEM);
    await popup.close();
  });

  test("the Analytics entry in the menu opens the PostHog dashboards the same way", async ({
    page,
  }) => {
    const asked = await stubVendors(page);
    await open(page);

    const opened = page.context().waitForEvent("page");
    await sidebar(page)
      .getByRole("link", { name: /^Analytics/ })
      .click();
    const popup = await opened;
    await popup.waitForLoadState();

    expect(popup.url()).toBe(POSTHOG_DASHBOARDS);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(
      asked.find((entry) => entry.url === POSTHOG_DASHBOARDS)?.referer,
    ).toBeUndefined();
    expect(page.url()).toContain(SYSTEM);
    await popup.close();
  });

  test("the keyboard reaches every link in reading order, and shows where it is", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("tab", { name: "System" }).focus();

    const reached: string[] = [];
    let ringed = true;
    for (let press = 0; press < 40 && reached.length < 7; press += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLAnchorElement | null;
        if (!element || element.tagName !== "A" || !element.closest("main")) {
          return null;
        }
        return {
          href: element.getAttribute("href"),
          ring: getComputedStyle(element).boxShadow,
        };
      });
      if (focused) {
        reached.push(focused.href ?? "");
        // The focus ring is a box-shadow ring (Tailwind's `ring-2`).
        if (focused.ring === "none") ringed = false;
      }
    }

    expect(reached).toEqual([...GRAFANA_LINKS, ...POSTHOG_LINKS]);
    expect(ringed, "every focused link shows a ring").toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`reads clearly in ${scheme} mode — no text on the tab is below 4.5:1 against what is behind it`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      if (scheme === "dark")
        await expect(page.locator("html")).toHaveClass(/dark/);
      else await expect(page.locator("html")).not.toHaveClass(/dark/);

      // Every sentence, heading, badge, link and setting name in the panel — all
      // of it, not a sample — and the reading names the worst offender.
      const sections = main(page).locator(
        "section[aria-labelledby^='system-']",
      );
      await expect(sections).toHaveCount(4);
      for (const section of await sections.all()) {
        const heading = await section
          .getByRole("heading", { level: 2 })
          .innerText();
        const worst = await lowestTextContrast(section);
        expect(
          worst.measured,
          `${scheme}: text measured in “${heading}”`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          worst.ratio,
          `${scheme}: lowest contrast in “${heading}”, on “${worst.text}”`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      await shot(page, `system-${scheme}`);

      if (scheme === "light") {
        // The measurement can fail. The app's muted text colour — the one thing
        // the panel avoids for sentences — reads below 4.5 on a card in this theme.
        await cards(page)
          .first()
          .evaluate((card) => {
            const probe = document.createElement("p");
            probe.id = "contrast-probe";
            probe.textContent = "muted sample";
            probe.style.color = "var(--muted-foreground)";
            card.appendChild(probe);
          });
        expect(
          await textContrast(page.locator("#contrast-probe")),
        ).toBeLessThan(4.5);
        await page
          .locator("#contrast-probe")
          .evaluate((probe) => probe.remove());
      }
    });
  }

  test("lays out at 390px without scrolling the page sideways, in one column, and the menu offers Analytics", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // One column: every card is as wide as the content area, none beside another.
    const frame = await main(page).boundingBox();
    const boxes = await cards(page).evaluateAll((elements) =>
      elements.map((element) => {
        const { left, width } = element.getBoundingClientRect();
        return { left, width };
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    for (const box of boxes) {
      expect(Math.abs(box.left - boxes[0]!.left)).toBeLessThan(1);
      expect(box.width).toBeLessThanOrEqual(frame!.width + 1);
    }
    await shot(page, "system-mobile");

    await page.getByRole("button", { name: "Open Admin navigation" }).click();
    const link = sidebar(page).getByRole("link", { name: /^Analytics/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", POSTHOG_DASHBOARDS);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "system-mobile-menu");
  });
});
