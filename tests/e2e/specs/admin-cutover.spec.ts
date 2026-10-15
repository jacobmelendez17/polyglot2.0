import { expect, test, type Page, type Request } from "@playwright/test";

import {
  removeBulkFixtureItems,
  removeSeededDecks,
  removeSeededGroups,
  removeSeededImports,
  removeSeededLevels,
  seedBulkItems,
  seedDeck,
  seedGroup,
  seedImport,
  seedLevel,
  setE2EAdminRole,
} from "../support/e2e-admin";
import { spendRateBudget } from "../support/rate-budget";

/**
 * Spec 26 Unit 11 — the final cutover of the Admin shell, against the real
 * signed-in app and the isolated E2E database: that the navigation is the
 * server's effective permissions rendered (and so agrees with what each page
 * allows), that every migrated page is a React Admin screen under its canonical
 * Next URL, that the retained specialist pages are still there and still
 * render, and that a nested page keeps its own section marked current.
 *
 * Roles other than admin flip the permanent E2E admin identity's *database* role
 * and restore it after every test. Everything this file creates (a level, a
 * group, a word, a deck, an import) is inserted directly and removed after each
 * test — decks and imports first, then words, groups, levels.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const SHOTS = process.env.E2E_SHOTS_DIR;

const RUN = crypto.randomUUID().slice(0, 6);
const TAG = `u11-${RUN}`;

test.use({ storageState: ADMIN_AUTH });
// A cold `next dev` compile of each route can take a minute, and some tests
// open every page of the console.
test.describe.configure({ mode: "serial", timeout: 300_000 });

let createdLevels: string[] = [];
let createdGroups: string[] = [];
let createdItems: string[] = [];
let createdDecks: string[] = [];
let createdImports: string[] = [];

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  await removeSeededDecks(createdDecks);
  await removeSeededImports(createdImports);
  await removeBulkFixtureItems(createdItems);
  await removeSeededGroups(createdGroups);
  await removeSeededLevels(createdLevels);
  createdLevels = [];
  createdGroups = [];
  createdItems = [];
  createdDecks = [];
  createdImports = [];
});

/* -------------------------------------------------------------------------- */
/* The cutover matrix                                                         */
/* -------------------------------------------------------------------------- */

type Surface = {
  /** The sidebar link that opens it. */
  label: string;
  href: string;
  /** The page's own heading. */
  heading: string;
  /** The admin API a React Admin screen reads its data from; absent for a retained specialist page. */
  api?: string;
  /** The effective-permissions resource the link is offered for; absent for the developer tools. */
  resource?: string;
};

/** Every page the sidebar links to, in the order it shows them. */
const SURFACES: Surface[] = [
  {
    label: "Overview",
    href: "/admin",
    heading: "Overview",
    api: "/api/v1/admin/overview",
    resource: "overview",
  },
  {
    label: "Curriculum",
    href: "/admin/curriculum",
    heading: "Curriculum",
    api: "/api/v1/admin/curriculum",
    resource: "curriculum",
  },
  {
    label: "Review",
    href: "/admin/curriculum/review",
    heading: "Review",
    api: "/api/v1/admin/review",
    resource: "review",
  },
  {
    label: "Levels",
    href: "/admin/curriculum/levels",
    heading: "Levels",
    api: "/api/v1/admin/levels",
    resource: "levels",
  },
  {
    label: "Groups",
    href: "/admin/curriculum/groups",
    heading: "Groups",
    api: "/api/v1/admin/groups",
    resource: "groups",
  },
  {
    label: "Imports",
    href: "/admin/curriculum/imports",
    heading: "Curriculum Imports",
    api: "/api/v1/admin/imports",
    resource: "imports",
  },
  {
    label: "Dictionary",
    href: "/admin/dictionary",
    heading: "Dictionary",
    api: "/api/v1/admin/dictionary",
    resource: "dictionary",
  },
  {
    label: "Decks",
    href: "/admin/decks",
    heading: "Decks",
    api: "/api/v1/admin/decks",
    resource: "decks",
  },
  // Retained specialist tools: server-rendered, no React Admin.
  { label: "Logs", href: "/admin/logs", heading: "Logs" },
  { label: "Sandbox", href: "/admin/sandbox", heading: "Sandbox" },
  {
    label: "Users",
    href: "/admin/users",
    heading: "Users",
    api: "/api/v1/admin/users",
    resource: "users",
  },
];

/** What each role's menu offers — the same list the unit tests pin for `getAdminNavItems`. */
const MENUS = {
  admin: SURFACES.map((surface) => surface.label),
  writer: [
    "Overview",
    "Curriculum",
    "Review",
    "Levels",
    "Groups",
    "Imports",
    "Dictionary",
  ],
  developer: ["Overview", "Logs", "Sandbox"],
} as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Admin" });
const current = (page: Page) => sidebar(page).locator('[aria-current="page"]');

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // A sheet slides in; a picture taken mid-slide shows a ghost of it. Only
  // animations that end are waited for: the dev server's "Compiling…" badge and
  // every spinner loop forever, and `finished` on one of those never settles —
  // which hung this helper (and the test, to its 300 s timeout) in a full run.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) =>
          animation.finished.then(
            () => undefined,
            () => undefined,
          ),
        ),
    ),
  );
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/** Resolves with the admin API's own GET of `path`, started before the action that causes it. */
const apiRead = (page: Page, path: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === "GET",
    { timeout: 60_000 },
  );

/** Records every request to the admin API from now until the returned function is called. */
function recordAdminApi(page: Page): () => string[] {
  const seen: string[] = [];
  const onRequest = (request: Request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/v1/admin/")) seen.push(pathname);
  };
  page.on("request", onRequest);
  return () => {
    page.off("request", onRequest);
    return seen;
  };
}

/* -------------------------------------------------------------------------- */
/* Who is offered what                                                        */
/* -------------------------------------------------------------------------- */

test.describe("the menu is the permissions", () => {
  test("each role's menu is the server's effective permissions rendered — and every page it offers opens, and every page it does not refuses", async ({
    page,
  }) => {
    for (const role of ["admin", "writer", "developer"] as const) {
      await setE2EAdminRole(role);
      await page.goto("/admin");
      await expect(sidebar(page)).toBeVisible();
      const labels = await sidebar(page).getByRole("link").allInnerTexts();
      expect(labels, `${role}: the menu`).toEqual(MENUS[role]);

      // The menu and `/api/v1/admin/me` are one answer, asked twice.
      const me = await page.request.get("/api/v1/admin/me");
      const { resources, canUseDeveloperTools } = (await me.json()).data
        .permissions;
      const offered = SURFACES.filter((surface) =>
        labels.includes(surface.label),
      );
      expect(
        offered.flatMap((surface) => surface.resource ?? []).sort(),
        `${role}: the resources`,
      ).toEqual(Object.keys(resources).sort());
      expect(
        offered.some((surface) => surface.resource === undefined),
        `${role}: the developer tools`,
      ).toBe(canUseDeveloperTools);

      if (role === "admin") {
        await shot(page, "shell-admin-light");
        continue;
      }
      // Hiding a link is never authorization — but a menu must not offer a page
      // that refuses, nor hide one that opens.
      for (const surface of SURFACES) {
        const response = await page.goto(surface.href);
        expect(response?.status(), `${role}: ${surface.label}`).toBe(
          labels.includes(surface.label) ? 200 : 403,
        );
      }
      await page.goto("/admin");
      await shot(page, `shell-${role}-light`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Every migrated page is a React Admin screen; every retained one is not     */
/* -------------------------------------------------------------------------- */

test.describe("the cutover", () => {
  test("an Admin's links are real navigations to canonical URLs — each marks itself current, a migrated page reads its own admin API, a retained one reads none", async ({
    page,
  }) => {
    await spendRateBudget("admin-user-search");
    for (const surface of SURFACES) {
      const stop = recordAdminApi(page);
      const read = surface.api ? apiRead(page, surface.api) : undefined;
      if (surface.href === "/admin") await page.goto("/admin");
      else
        await sidebar(page)
          .getByRole("link", { name: surface.label, exact: true })
          .click();

      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
        .toBe(surface.href);
      await expect(
        page.getByRole("heading", {
          name: surface.heading,
          exact: true,
          level: 1,
        }),
      ).toBeVisible({ timeout: 60_000 });
      await noHash(page);

      // Exactly one link is current, and it is this one.
      await expect(current(page)).toHaveCount(1);
      await expect(current(page)).toHaveText(surface.label);

      if (read) {
        expect(
          (await read).status(),
          `${surface.label}: reads ${surface.api}`,
        ).toBe(200);
        await expect(page.getByRole("status")).toHaveCount(0);
      } else {
        // A retained specialist page is server-rendered; give a stray fetch a
        // moment to show itself.
        await page.waitForTimeout(500);
      }
      const calls = stop();
      if (!surface.api)
        expect(calls, `${surface.label}: no React Admin data requests`).toEqual(
          [],
        );
      await shot(page, `shell-${surface.label.toLowerCase()}-light`);
    }

    // Back goes where it came from, and the menu follows.
    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/admin/sandbox");
    await expect(current(page)).toHaveText("Sandbox");
    await noHash(page);
  });

  test("a nested page keeps its own section current, and the retained specialist pages still render", async ({
    page,
  }) => {
    const level = await seedLevel();
    createdLevels.push(level.id);
    const group = await seedGroup(level.id, { name: `${TAG} group` });
    createdGroups.push(group.id);
    const [item] = await seedBulkItems(level.id, group.id, [
      { term: `${TAG}-word`, status: "published" },
    ]);
    createdItems.push(item!);
    const deck = await seedDeck({
      name: `${TAG} deck`,
      itemIds: [item!],
    });
    createdDecks.push(deck.id);
    const imported = await seedImport({ filename: `${TAG}-nested.csv` });
    createdImports.push(imported.id);

    const pages: { path: string; section: string; api?: string }[] = [
      // React Admin screens below a section's own list. A level's and a group's
      // form are server-rendered with their values and write through the
      // command API, so what shows the form is React Admin's — the permission
      // check that decides whether it is editable — is its read of `/me`.
      {
        path: `/admin/curriculum/levels/${level.id}`,
        section: "Levels",
        api: "/api/v1/admin/me",
      },
      {
        path: `/admin/curriculum/groups/${group.id}`,
        section: "Groups",
        api: "/api/v1/admin/me",
      },
      {
        path: "/admin/curriculum/imports/archived",
        section: "Imports",
        api: "/api/v1/admin/imports",
      },
      // …and the specialist screens that stay: the item editor, the import's
      // own page and its upload, and a deck's editor.
      { path: `/admin/curriculum/items/${item}`, section: "Curriculum" },
      { path: "/admin/curriculum/items/new", section: "Curriculum" },
      { path: `/admin/curriculum/imports/${imported.id}`, section: "Imports" },
      { path: "/admin/curriculum/imports/new", section: "Imports" },
      { path: `/admin/decks/${deck.id}`, section: "Decks" },
    ];

    for (const entry of pages) {
      const stop = recordAdminApi(page);
      const read = entry.api ? apiRead(page, entry.api) : undefined;
      const response = await page.goto(entry.path);
      expect(response?.status(), entry.path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(
        { timeout: 60_000 },
      );
      await expect(current(page), entry.path).toHaveCount(1);
      await expect(current(page), entry.path).toHaveText(entry.section);
      await noHash(page);
      if (read) expect((await read).status(), entry.path).toBe(200);
      else await page.waitForTimeout(500);
      const calls = stop();
      if (!entry.api)
        expect(calls, `${entry.path}: no React Admin data requests`).toEqual(
          [],
        );
    }
  });

  test("the menu is reachable by keyboard alone", async ({ page }) => {
    await page.goto("/admin");
    const decks = sidebar(page).getByRole("link", {
      name: "Decks",
      exact: true,
    });
    await decks.focus();
    await expect(decks).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
      .toBe("/admin/decks");
    await expect(current(page)).toHaveText("Decks");

    // Tab moves down the menu, one link at a time, in the order shown.
    await sidebar(page)
      .getByRole("link", { name: "Dictionary", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(decks).toBeFocused();
  });
});

/* -------------------------------------------------------------------------- */
/* The phone menu                                                             */
/* -------------------------------------------------------------------------- */

test.describe("on a phone", () => {
  test("the menu sheet offers each role the same links as the sidebar, and choosing one navigates and closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const role of ["admin", "writer"] as const) {
      await setE2EAdminRole(role);
      await page.goto("/admin");
      await expect(
        page.getByRole("heading", { name: "Overview", level: 1 }),
      ).toBeVisible();
      // The desktop sidebar is not on screen; the sheet's trigger is.
      await expect(sidebar(page)).toHaveCount(0);
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      await page.getByRole("button", { name: "Open Admin navigation" }).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      expect(
        await sheet.getByRole("link").allInnerTexts(),
        `${role}: the sheet`,
      ).toEqual(MENUS[role]);
      await expect(sheet.locator('[aria-current="page"]')).toHaveText(
        "Overview",
      );
      await shot(page, `shell-menu-${role}-mobile`);

      await sheet
        .getByRole("link", { name: "Dictionary", exact: true })
        .click();
      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 60_000 })
        .toBe("/admin/dictionary");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Dictionary", level: 1 }),
      ).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });
});
