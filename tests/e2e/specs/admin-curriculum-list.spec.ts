import { expect, test, type Page } from "@playwright/test";

import {
  getE2EAdminScope,
  removeSeededItems,
  seedExtraVocabulary,
  seedOtherLanguage,
  setE2EAdminRole,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";

/**
 * Spec 26 Unit 2 — the Admin curriculum list, rendered through React Admin,
 * against the real signed-in app and the isolated E2E database.
 *
 * The seeded E2E curriculum is 9 items. The list pages 20 at a time, so this
 * file adds throwaway vocabulary (27 rows, including an accented/unaccented
 * pair) to make a second page, and removes exactly what it added afterwards.
 * Roles other than admin flip the permanent E2E admin identity's *database*
 * role and restore it (see `support/e2e-admin.ts`).
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PAGE_SIZE = 20;

/** 25 plain terms + an accent pair. `zzsí` and `zzsi` differ only by an accent. */
const PLAIN_TERMS = Array.from(
  { length: 25 },
  (_, index) => `zzp${String(index + 1).padStart(2, "0")}`,
);
const ACCENT_TERMS = ["zzsí", "zzsi"];

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial" });

let seededIds: string[] = [];
let languageId = "";
let levelId = "";

test.beforeAll(async () => {
  ({ languageId, levelId } = await getE2EAdminScope());
  seededIds = await seedExtraVocabulary([...PLAIN_TERMS, ...ACCENT_TERMS]);
});

test.afterAll(async () => {
  await removeSeededItems(seededIds);
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
});

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const table = (page: Page) =>
  page.getByRole("table", { name: "Curriculum items" });

/** The item names on screen, in order. */
async function labels(page: Page): Promise<string[]> {
  return table(page).getByRole("link").allInnerTexts();
}

async function listReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

/** Every item the API knows for the E2E language, in the list's own order. */
async function allItemLabels(page: Page): Promise<string[]> {
  await renewSession(page);
  const response = await page.request.get(
    `/api/v1/admin/curriculum?language=${languageId}&limit=100`,
  );
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data.nextCursor).toBeNull();
  return data.items.map((item: { itemLabel: string }) => item.itemLabel);
}

async function choose(page: Page, label: RegExp, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

test.describe("rows and paging", () => {
  test("shows the item table with the legacy columns", async ({ page }) => {
    await page.goto("/admin/curriculum");
    await listReady(page);

    const headers = await table(page).getByRole("columnheader").allInnerTexts();
    expect(headers.slice(1)).toEqual([
      "Type",
      "Item",
      "Meaning",
      "Level",
      "Group",
      "Status",
    ]);
    await expect(
      table(page).getByRole("link", { name: "el gato" }),
    ).toBeVisible();
    await shot(page, "curriculum-list-light");
  });

  test("walks two pages by the server's cursors, with no gaps or duplicates", async ({
    page,
  }) => {
    const everything = await allItemLabels(page);
    expect(everything.length).toBe(
      9 + PLAIN_TERMS.length + ACCENT_TERMS.length,
    );

    await page.goto("/admin/curriculum");
    await listReady(page);
    const first = await labels(page);
    expect(first).toHaveLength(PAGE_SIZE);
    expect(first).toEqual(everything.slice(0, PAGE_SIZE));

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(table(page).getByRole("link").first()).not.toHaveText(
      first[0]!,
    );
    const second = await labels(page);

    expect(second).toEqual(everything.slice(PAGE_SIZE));
    expect([...first, ...second]).toEqual(everything);
    expect(new Set([...first, ...second]).size).toBe(everything.length);
    // The last page has no Next.
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    await noHash(page);
    await shot(page, "curriculum-list-page2");
  });

  test("shows no total and no page numbers", async ({ page }) => {
    await page.goto("/admin/curriculum");
    await listReady(page);
    await expect(page.getByText(/\bof \d+\b/)).toHaveCount(0);
    await expect(page.getByText(/\bpage \d+\b/i)).toHaveCount(0);
  });

  test("Back, Previous, and a refresh all return to the right page", async ({
    page,
  }) => {
    // What each page must show, from the API's own ordering. (Reading the
    // table straight after a click would race the list's deliberate "keep the
    // previous page on screen while the next loads".)
    const everything = await allItemLabels(page);
    const first = everything.slice(0, PAGE_SIZE);
    const second = everything.slice(PAGE_SIZE);

    await page.goto("/admin/curriculum");
    await listReady(page);
    await expect.poll(() => labels(page)).toEqual(first);

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    const secondUrl = page.url();
    await expect.poll(() => labels(page)).toEqual(second);

    // Browser Back.
    await page.goBack();
    await expect(page).not.toHaveURL(/cursor=/);
    await expect.poll(() => labels(page)).toEqual(first);

    // Forward, then a hard refresh *on page two* — no client history survives.
    await page.goForward();
    await expect(page).toHaveURL(secondUrl);
    await expect.poll(() => labels(page)).toEqual(second);
    await page.reload();
    await listReady(page);
    await expect.poll(() => labels(page)).toEqual(second);

    // Previous works from a cold deep link: the cursor alone says where back is.
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page).not.toHaveURL(/cursor=/);
    await expect.poll(() => labels(page)).toEqual(first);
    await noHash(page);
  });

  test("never writes a hash route into the address bar", async ({ page }) => {
    // The Unit 1 hole: React Admin must not navigate in a router of its own.
    await page.goto("/admin/curriculum");
    await listReady(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await choose(page, /Type/, "Grammar");
    await expect(page).toHaveURL(/type=grammar/);

    await noHash(page);
    expect(page.url()).not.toContain("#");
  });
});

test.describe("filters and search", () => {
  test("a type filter goes into the URL, restarts at page one, and matches the API", async ({
    page,
  }) => {
    await page.goto("/admin/curriculum");
    await listReady(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);

    await choose(page, /Type/, "Grammar");

    await expect(page).toHaveURL(/type=grammar/);
    await expect(page).not.toHaveURL(/cursor=/);
    const api = await page.request.get(
      `/api/v1/admin/curriculum?language=${languageId}&type=grammar&limit=100`,
    );
    const expected = (await api.json()).data.items.map(
      (item: { itemLabel: string }) => item.itemLabel,
    );
    await expect.poll(() => labels(page)).toEqual(expected);
    await expect(table(page).getByText("Vocab")).toHaveCount(0);
  });

  test("a status filter shows only that status, and the pending item is findable", async ({
    page,
  }) => {
    await page.goto("/admin/curriculum");
    await listReady(page);
    await choose(page, /Status/, "Pending");

    await expect(page).toHaveURL(/status=pending/);
    await expect(
      table(page).getByRole("link", { name: "amarillo" }),
    ).toBeVisible();
    await expect(table(page).getByText("Published")).toHaveCount(0);
  });

  test("search ignores case, keeps accents, and refines in place", async ({
    page,
  }) => {
    await page.goto("/admin/curriculum");
    await listReady(page);
    const historyBefore = await page.evaluate(() => history.length);

    const search = page.getByRole("searchbox", { name: /Search curriculum/ });
    await search.fill("zzsí");
    await expect(page).toHaveURL(/search=zzs%C3%AD/);
    // Accent-preserving: only the accented item, never its unaccented twin.
    await expect.poll(() => labels(page)).toEqual(["zzsí"]);

    await search.fill("ZZSI");
    await expect.poll(() => labels(page)).toEqual(["zzsi"]);

    await search.fill("ZZP0");
    await expect.poll(() => labels(page)).toEqual(PLAIN_TERMS.slice(0, 9));

    // Typing replaced the entry instead of stacking one per refinement.
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await noHash(page);
  });

  test("clearing the filters from the empty state restores the list", async ({
    page,
  }) => {
    await page.goto(
      `/admin/curriculum?language=${languageId}&search=definitely-nothing-matches`,
    );
    await expect(
      page.getByText("No curriculum items match these filters"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();

    await expect(page).not.toHaveURL(/search=/);
    await listReady(page);
    await expect(table(page).getByRole("link").first()).toBeVisible();
  });
});

test.describe("navigation into the editor", () => {
  test("carries the exact view through ?from= and back", async ({ page }) => {
    await page.goto(`/admin/curriculum?language=${languageId}&search=zzp0`);
    await listReady(page);
    const viewUrl = page.url();
    await expect.poll(() => labels(page)).toEqual(PLAIN_TERMS.slice(0, 9));

    await table(page).getByRole("link", { name: "zzp03" }).click();
    await expect(page).toHaveURL(/\/admin\/curriculum\/items\/[^?]+\?from=/);
    expect(
      decodeURIComponent(new URL(page.url()).searchParams.get("from")!),
    ).toBe(`language=${languageId}&search=zzp0`);

    await page
      .getByRole("link", { name: /Return to Results/ })
      .first()
      .click();
    await expect(page).toHaveURL(viewUrl);
    await listReady(page);
    await expect.poll(() => labels(page)).toEqual(PLAIN_TERMS.slice(0, 9));
  });

  test("the whole row is a click target, not just the name", async ({
    page,
  }) => {
    await page.goto(`/admin/curriculum?language=${languageId}&search=zzp05`);
    await listReady(page);

    // Click the meaning cell — nowhere near the link text. The link's overlay
    // covers it by design, so Playwright's "is anything intercepting?" check
    // would refuse; `force` skips that check but still performs a real mouse
    // click, which the browser hit-tests to the overlay and follows.
    await table(page)
      .getByRole("cell", { name: /meaning of zzp05/ })
      .click({ force: true });

    await expect(page).toHaveURL(/\/admin\/curriculum\/items\//);
  });

  test("is operable by keyboard alone", async ({ page }) => {
    await page.goto(`/admin/curriculum?language=${languageId}&search=zzp07`);
    await listReady(page);

    const link = table(page).getByRole("link", { name: "zzp07" });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/admin\/curriculum\/items\//);
  });
});

test.describe("roles", () => {
  test("a writer can browse the list", async ({ page }) => {
    await setE2EAdminRole("writer");
    await page.goto("/admin/curriculum");
    await listReady(page);
    expect((await labels(page)).length).toBeGreaterThan(0);

    const api = await page.request.get(
      `/api/v1/admin/curriculum?language=${languageId}`,
    );
    expect(api.status()).toBe(200);
  });

  test("a developer is turned away from both the page and the endpoint", async ({
    page,
  }) => {
    await setE2EAdminRole("developer");

    const pageResponse = await page.goto("/admin/curriculum");
    expect(pageResponse?.status()).toBe(403);
    await expect(table(page)).toHaveCount(0);
    await page.waitForFunction(() =>
      Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    );

    const api = await page.request.get(
      `/api/v1/admin/curriculum?language=${languageId}`,
    );
    expect(api.status()).toBe(403);
    expect(await api.json()).not.toHaveProperty("data");
  });

  test("a learner gets 403 and a visitor gets 401 from the endpoint", async ({
    browser,
  }) => {
    const url = `/api/v1/admin/curriculum?language=${languageId}`;

    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    await renewSession(learnerPage);
    expect((await learnerPage.request.get(url)).status()).toBe(403);
    await learner.close();

    const visitor = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    expect((await visitor.request.get(url)).status()).toBe(401);
    await visitor.close();
  });

  test("a role revoked while the list is open replaces the rows with access-denied", async ({
    page,
  }) => {
    await page.goto("/admin/curriculum");
    await listReady(page);
    await expect(table(page).getByRole("link").first()).toBeVisible();

    await setE2EAdminRole("user");
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "You don't have access to this part" }),
    ).toBeVisible();
    // Privileged rows must not linger beside the denial.
    await expect(table(page)).toHaveCount(0);
    await shot(page, "curriculum-list-revoked");
  });
});

test.describe("what the endpoint refuses", () => {
  const base = () => `/api/v1/admin/curriculum?language=${languageId}`;

  test("an unsupported sort, a page number, or an unknown parameter is a 422", async ({
    page,
  }) => {
    await renewSession(page);
    for (const extra of ["sort=term", "order=DESC", "page=2", "color=red"]) {
      const response = await page.request.get(`${base()}&${extra}`);
      expect(response.status(), extra).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    }
  });

  test("a tampered cursor is a 422, not a crash", async ({ page }) => {
    await renewSession(page);
    for (const cursor of [
      "garbage",
      "e30",
      Buffer.from("[1]").toString("base64url"),
    ]) {
      const response = await page.request.get(`${base()}&cursor=${cursor}`);
      expect(response.status(), cursor).toBe(422);
    }
  });

  test("a limit above the cap is refused", async ({ page }) => {
    await renewSession(page);
    expect((await page.request.get(`${base()}&limit=101`)).status()).toBe(422);
    expect((await page.request.get(`${base()}&limit=100`)).status()).toBe(200);
  });

  test("an unknown language is a 404", async ({ page }) => {
    await renewSession(page);
    const response = await page.request.get(
      "/api/v1/admin/curriculum?language=9d9d9d9d-9d9d-4d9d-9d9d-9d9d9d9d9d9d",
    );
    expect(response.status()).toBe(404);
  });
});

test.describe("language isolation", () => {
  test("never mixes languages, and refuses another language's level", async ({
    page,
  }) => {
    const other = await seedOtherLanguage("e2eother");
    await renewSession(page);
    try {
      // Its own list holds only its own item …
      const otherList = await page.request.get(
        `/api/v1/admin/curriculum?language=${other.languageId}&limit=100`,
      );
      const otherItems = (await otherList.json()).data.items.map(
        (item: { id: string }) => item.id,
      );
      expect(otherItems).toEqual([other.itemId]);

      // … and the first language's list never contains it.
      const ours = await page.request.get(
        `/api/v1/admin/curriculum?language=${languageId}&limit=100`,
      );
      const ourIds = (await ours.json()).data.items.map(
        (item: { id: string }) => item.id,
      );
      expect(ourIds).not.toContain(other.itemId);

      // A level from one language, asked for under the other, is a malformed
      // request (422) — not a quiet "nothing matches".
      const mismatched = await page.request.get(
        `/api/v1/admin/curriculum?language=${other.languageId}&level=${levelId}`,
      );
      expect(mismatched.status()).toBe(422);
      const reverse = await page.request.get(
        `/api/v1/admin/curriculum?language=${languageId}&level=${other.levelId}`,
      );
      expect(reverse.status()).toBe(422);

      // In the UI, switching language shows the other language's items only,
      // and drops the level that belonged to this one.
      await page.goto(
        `/admin/curriculum?language=${languageId}&level=${levelId}`,
      );
      await listReady(page);
      // The other language's name carries a random suffix, so match its prefix.
      await page.getByRole("combobox", { name: /Language/ }).click();
      await page.getByRole("option").filter({ hasText: "E2E Other" }).click();
      await expect(page).toHaveURL(new RegExp(`language=${other.languageId}`));
      await expect(page).not.toHaveURL(/level=/);
      await expect.poll(() => labels(page)).toEqual(["e2eother"]);
    } finally {
      await other.remove();
    }
  });
});

test.describe("stale data and bulk actions", () => {
  test("a row removed behind the list's back disappears on refocus, taking its selection with it", async ({
    page,
  }) => {
    const [extraId] = await seedExtraVocabulary(["zzstale"]);
    try {
      await page.goto(
        `/admin/curriculum?language=${languageId}&search=zzstale`,
      );
      await listReady(page);
      await expect.poll(() => labels(page)).toEqual(["zzstale"]);

      await table(page).getByRole("checkbox").nth(1).check();
      await expect(page.getByText("1 selected")).toBeVisible();

      await removeSeededItems([extraId!]);
      await page.evaluate(() => {
        document.dispatchEvent(
          new Event("visibilitychange", { bubbles: true }),
        );
      });

      // Neither the row nor an "N selected" for an id no longer on screen.
      await expect(
        page.getByText("No curriculum items match these filters"),
      ).toBeVisible();
      await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
    } finally {
      await removeSeededItems([extraId!]);
    }
  });

  test("a real bulk archive refreshes the list that fetched itself", async ({
    page,
  }) => {
    await page.goto(`/admin/curriculum?language=${languageId}&search=zzp25`);
    await listReady(page);
    await expect.poll(() => labels(page)).toEqual(["zzp25"]);

    const row = table(page).getByRole("row").filter({ hasText: "zzp25" });
    await expect(row.getByText("Published")).toBeVisible();
    await row.getByRole("checkbox").check();
    await expect(page.getByText("1 selected")).toBeVisible();

    await page.getByRole("button", { name: "Archive selected" }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();

    // `router.refresh()` cannot update a client-fetched list; the new status
    // appearing proves the list re-fetched, and the bar proves selection cleared.
    await expect(row.getByText("Archived")).toBeVisible();
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });

  test("selection does not survive a page change", async ({ page }) => {
    await page.goto(`/admin/curriculum?language=${languageId}`);
    await listReady(page);
    await table(page).getByRole("checkbox").nth(1).check();
    await expect(page.getByText("1 selected")).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);

    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });
});

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/admin/curriculum");
    await listReady(page);
    await expect(page.locator("html")).toHaveClass(/dark/);

    // A Material UI table cell takes its text colour from the MUI palette,
    // which is built from the live `--text-primary` token. If the theme did
    // not follow Polyglot's dark mode, it would paint MUI's own default.
    const { cellColor, expected, tableBorder, expectedBorder } =
      await page.evaluate(() => {
        const cell = document.querySelector(
          '[aria-label="Curriculum items"] tbody td:nth-child(4)',
        ) as HTMLElement;
        const root = document.querySelector(".RaDataTable-root") as HTMLElement;
        const probe = document.createElement("div");
        document.body.appendChild(probe);
        probe.style.color = "var(--text-primary)";
        probe.style.borderTopColor = "var(--border-default)";
        probe.style.borderTopStyle = "solid";
        probe.style.borderTopWidth = "1px";
        const result = {
          cellColor: getComputedStyle(cell).color,
          expected: getComputedStyle(probe).color,
          tableBorder: getComputedStyle(root).borderTopColor,
          expectedBorder: getComputedStyle(probe).borderTopColor,
        };
        probe.remove();
        return result;
      });
    expect(cellColor).toBe(expected);
    expect(tableBorder).toBe(expectedBorder);
    await shot(page, "curriculum-list-dark");
  });

  test("lays out at 390px without scrolling the page sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/curriculum");
    await listReady(page);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(table(page).getByRole("link").first()).toBeVisible();
    await shot(page, "curriculum-list-mobile");
  });
});
