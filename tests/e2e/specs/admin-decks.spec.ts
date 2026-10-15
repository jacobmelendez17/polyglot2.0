import { expect, test, type Page } from "@playwright/test";

import {
  countE2EItemAudits,
  getE2EAdminScope,
  getE2EAdminUserId,
  getE2EDecksNamed,
  removeBulkFixtureItems,
  removeSeededDecks,
  removeSeededGroups,
  removeSeededLevels,
  seedBulkItems,
  seedDeck,
  seedEmptyLanguage,
  seedGroup,
  seedLevel,
  setE2EAdminRole,
  type E2EDeck,
  type E2ELevel,
  type SeedDeckOptions,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";

/**
 * Spec 26 Unit 10 — the official-decks list, rendered through React Admin,
 * against the real signed-in app and the isolated E2E database. A deck's own
 * page (its membership, order and deletion) and the "Add deck" dialog are the
 * specialist screens and are unchanged; what is exercised here is the list that
 * finds a deck, the one entry into those screens, and the rule that only an Admin
 * has this surface and only official decks are on it.
 *
 * Every level, group, word and deck this file needs is inserted directly (see
 * `support/e2e-admin.ts`), under a throwaway level numbered well away from
 * anything seeded, and removed after each test — decks first (they name the
 * words and the gate level), then words, groups, levels. Roles other than admin
 * flip the permanent E2E admin identity's *database* role and restore it after
 * every test.
 *
 * The one write is the specialist dialog's "Add deck" (a `deck-mutation`, 30 /
 * 60s — a real control, never relaxed; one request is nowhere near it).
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PAGE = "/admin/decks";
const API = "/api/v1/admin/decks";

const RUN = crypto.randomUUID().slice(0, 6);
/** Every deck and word this run makes starts with this — so a test finds, and removes, exactly its own. */
const TAG = `u10-${RUN}`;
/** For the first visit to a route, which `next dev` compiles on demand (observed up to a minute). */
const SLOW = { timeout: 60_000 };

test.use({ storageState: ADMIN_AUTH });
// A cold `next dev` compile of a route can take a minute.
test.describe.configure({ mode: "serial", timeout: 180_000 });

let languageId = "";
let adminUserId = "";
let createdLevels: string[] = [];
let createdGroups: string[] = [];
let createdItems: string[] = [];
let createdDecks: string[] = [];

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
  adminUserId = await getE2EAdminUserId();
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  // Decks name the words and their gate level; words name a group and a level.
  await removeSeededDecks(createdDecks);
  await removeBulkFixtureItems(createdItems);
  await removeSeededGroups(createdGroups);
  await removeSeededLevels(createdLevels);
  createdDecks = [];
  createdItems = [];
  createdGroups = [];
  createdLevels = [];
});

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A throwaway level (to gate a deck by) holding `count` published words (to put
 * in decks). The deck picker offers only items of a *published* level, so a test
 * that picks words through it asks for one.
 */
async function shelf(
  count = 3,
  options: { published?: boolean } = {},
): Promise<{ level: E2ELevel; items: string[] }> {
  const level = await seedLevel(
    options.published ? { status: "published" } : {},
  );
  createdLevels.push(level.id);
  const group = await seedGroup(level.id, { name: `${TAG} group` });
  createdGroups.push(group.id);
  const items = await seedBulkItems(
    level.id,
    group.id,
    Array.from({ length: count }, (_, index) => ({
      term: `${TAG}-w${index + 1}`,
      status: "published" as const,
    })),
  );
  createdItems.push(...items);
  return { level, items };
}

async function deck(options: SeedDeckOptions): Promise<E2EDeck> {
  const made = await seedDeck(options);
  createdDecks.push(made.id);
  return made;
}

/** Finds a deck the UI just created (by its exact name), and queues it for removal. */
async function adopt(name: string): Promise<E2EDeck> {
  const found = (await getE2EDecksNamed(name)).filter(
    (candidate) => candidate.name === name,
  );
  expect(found, `exactly one deck named "${name}" should exist`).toHaveLength(
    1,
  );
  createdDecks.push(found[0]!.id);
  return found[0]!;
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

const listUrl = (language = languageId) => `${PAGE}?language=${language}`;

const table = (page: Page) =>
  page.getByRole("table", { name: "Polyglot decks" });
// `has` is evaluated inside each row, so its locator must start at the page —
// one chained from the table would look for a table inside a row.
const rowOf = (page: Page, d: Pick<E2EDeck, "name">) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: d.name, exact: true }) });
const cellsOf = (page: Page, d: Pick<E2EDeck, "name">) =>
  rowOf(page, d).getByRole("cell");

/** The decks of this run the list shows, in the order it shows them. */
const ours = async (page: Page) =>
  (await table(page).getByRole("link").allInnerTexts()).filter((name) =>
    name.startsWith(TAG),
  );

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // A dialog fades in; a picture taken mid-fade shows nothing useful.
  const container = page.locator(".MuiDialog-container");
  if ((await container.count()) > 0)
    await expect(container).toHaveCSS("opacity", "1");
  // A select's menu fades out over whatever it was opened from.
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function listReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Decks", exact: true, level: 1 }),
  ).toBeVisible();
  // Whatever the list ends up showing: the table, or its empty state.
  await expect(
    table(page).or(page.getByText("No Polyglot decks yet for this language")),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function open(page: Page, language = languageId) {
  await page.goto(listUrl(language));
  await listReady(page);
}

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("the list", () => {
  test("lists the language's official decks in name order — never a personal one — and the whole row opens the deck's own page", async ({
    page,
  }) => {
    const w = await shelf();
    const alfa = await deck({
      name: `${TAG} Alfa level`,
      availability: "level",
      gateLevelId: w.level.id,
      itemIds: [w.items[2]!],
    });
    const bravo = await deck({
      name: `${TAG} Bravo theme`,
      description: "A short description",
      itemIds: [w.items[0]!, w.items[1]!],
    });
    const charlie = await deck({ name: `${TAG} Charlie empty` });
    // A learner's own deck — here, the Admin's own, which makes the point.
    const personal = await deck({
      name: `${TAG} Delta personal`,
      ownerUserId: adminUserId,
      itemIds: [w.items[0]!],
    });

    await open(page);
    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["Deck", "Description", "Items", "Availability"],
    );

    // The order the repository gives, and the database's own account of them.
    const inDatabase = (await getE2EDecksNamed(TAG)).filter(
      (candidate) => candidate.kind === "polyglot",
    );
    expect(inDatabase.map((d) => d.name)).toEqual([
      alfa.name,
      bravo.name,
      charlie.name,
    ]);
    expect(await ours(page)).toEqual(inDatabase.map((d) => d.name));
    await expect(page.getByText(personal.name)).toHaveCount(0);

    await expect(cellsOf(page, bravo).nth(1)).toHaveText("A short description");
    await expect(cellsOf(page, bravo).nth(2)).toHaveText("2");
    await expect(cellsOf(page, bravo).nth(3)).toHaveText(
      "Theme — reveals learned items",
    );
    await expect(cellsOf(page, alfa).nth(2)).toHaveText("1");
    await expect(cellsOf(page, alfa).nth(3)).toHaveText(
      `Hidden until Level ${w.level.levelNumber}`,
    );
    await expect(cellsOf(page, charlie).nth(1)).toHaveText("—");
    await expect(cellsOf(page, charlie).nth(2)).toHaveText("0");
    await noHash(page);
    await shot(page, "decks-list-light");

    // The deck's name is the one real link; its `::after` makes the whole row
    // the target, so a click on any cell opens the deck.
    const items = await cellsOf(page, bravo).nth(2).boundingBox();
    await page.mouse.click(
      items!.x + items!.width / 2,
      items!.y + items!.height / 2,
    );
    // A deck's own page is compiled on its first visit under `next dev`.
    await expect(page).toHaveURL(new RegExp(`${PAGE}/${bravo.id}$`), SLOW);
    await expect(
      page.getByRole("heading", { name: bravo.name, level: 1 }),
    ).toBeVisible(SLOW);

    await page.getByRole("link", { name: "← All decks" }).click();
    await expect(page).toHaveURL(new RegExp(`${PAGE}(\\?.*)?$`), SLOW);
    await listReady(page);
    await noHash(page);

    // A personal deck has no administrative page at all.
    expect((await page.goto(`${PAGE}/${personal.id}`))?.status()).toBe(404);
  });

  test("Add deck is still the specialist dialog: it makes an official deck, lands on its page, and the list then has it", async ({
    page,
  }) => {
    const w = await shelf(2, { published: true });
    const name = `${TAG} Created`;
    await open(page);

    await page.getByRole("button", { name: "Add deck" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a Polyglot deck" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Description (optional)").fill("Made by a spec");
    await dialog.getByLabel("Search items to add").fill(TAG);
    await dialog.getByLabel("Search items to add").press("Enter");
    for (const index of [1, 2])
      await dialog
        .getByRole("checkbox", { name: new RegExp(`${TAG}-w${index}`) })
        .check();
    await expect(dialog.getByRole("status")).toHaveText("2 selected");
    await shot(page, "decks-add-dialog-light");
    await dialog.getByRole("button", { name: "Add deck" }).click();

    await expect(page).toHaveURL(new RegExp(`${PAGE}/[0-9a-f-]{36}$`), SLOW);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible(
      SLOW,
    );

    const made = await adopt(name);
    expect(made).toMatchObject({
      kind: "polyglot",
      ownerUserId: null,
      description: "Made by a spec",
      availability: "theme",
      itemCount: 2,
      languageId,
    });
    expect(await countE2EItemAudits("DECK_CREATED", made.id)).toBe(1);
    expect(w.items).toHaveLength(2);

    await page.getByRole("link", { name: "← All decks" }).click();
    await open(page);
    await expect(rowOf(page, made)).toBeVisible();
    await expect(cellsOf(page, made).nth(2)).toHaveText("2");
  });

  test("reads one language at a time: a language with no deck says so, and the switch moves between them", async ({
    page,
  }) => {
    const w = await shelf(1);
    const mine = await deck({
      name: `${TAG} Mine`,
      itemIds: [w.items[0]!],
    });
    const empty = await seedEmptyLanguage();
    try {
      await open(page);
      const language = page.getByRole("combobox", { name: /Language/ });
      const myLanguage = (await language.innerText()).trim();
      await expect(rowOf(page, mine)).toBeVisible();

      // The other language's list is its own — and empty, which is a designed state.
      await language.click();
      await page
        .getByRole("option", { name: /^E2E Empty/ })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`language=${empty.languageId}`));
      await expect(
        page.getByText("No Polyglot decks yet for this language"),
      ).toBeVisible();
      await expect(page.getByText(mine.name)).toHaveCount(0);
      await shot(page, "decks-empty-light");

      await page.getByRole("combobox", { name: /Language/ }).click();
      await page.getByRole("option", { name: myLanguage, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`language=${languageId}`));
      await expect(rowOf(page, mine)).toBeVisible();
      await noHash(page);
    } finally {
      await empty.remove();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Who may use it, and what the endpoint will say                             */
/* -------------------------------------------------------------------------- */

test.describe("who may use it", () => {
  test("only an Admin has the page and the endpoint — a writer, a developer, a learner and a visitor do not, and a writer is not offered the link", async ({
    page,
    browser,
  }) => {
    const w = await shelf(1);
    const mine = await deck({ name: `${TAG} Mine`, itemIds: [w.items[0]!] });
    const url = `${API}?language=${languageId}`;
    const sidebar = page.getByRole("navigation", { name: "Admin" });

    await open(page);
    await expect(sidebar.getByRole("link", { name: "Decks" })).toBeVisible();
    await expect(rowOf(page, mine)).toBeVisible();

    for (const role of ["writer", "developer"] as const) {
      await setE2EAdminRole(role);
      expect((await page.goto(listUrl()))?.status(), `${role}: the page`).toBe(
        403,
      );
      expect(
        (await page.goto(`${PAGE}/${mine.id}`))?.status(),
        `${role}: a deck's page`,
      ).toBe(403);
      await renewSession(page);
      expect((await page.request.get(url)).status(), `${role}: the list`).toBe(
        403,
      );
      // Let in to the console — and not offered what would refuse them.
      expect((await page.goto("/admin"))?.status(), role).toBe(200);
      await expect(sidebar).toBeVisible();
      await expect(sidebar.getByRole("link", { name: "Decks" })).toHaveCount(0);
      const me = await page.request.get("/api/v1/admin/me");
      expect(
        (await me.json()).data.permissions.resources.decks,
        `${role}: the effective permissions`,
      ).toBeUndefined();
    }

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

  test("the endpoint lists official decks of one language, says nothing about owners, refuses what it does not honour, and is never cached", async ({
    page,
  }) => {
    const w = await shelf(2);
    const bravo = await deck({
      name: `${TAG} Bravo`,
      description: "About bravo",
      itemIds: [w.items[0]!, w.items[1]!],
    });
    const alfa = await deck({
      name: `${TAG} Alfa`,
      availability: "level",
      gateLevelId: w.level.id,
    });
    await deck({
      name: `${TAG} Personal`,
      ownerUserId: adminUserId,
      itemIds: [w.items[0]!],
    });
    await renewSession(page);
    const get = (query: string) => page.request.get(`${API}?${query}`);
    const mine = `language=${languageId}`;

    const ok = await get(mine);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("no-store");
    const body = (await ok.json()).data;
    expect(body.truncated).toBe(false);
    const listed = body.items.filter((row: { name: string }) =>
      row.name.startsWith(TAG),
    );
    // Both official decks, by name, and not the personal one.
    expect(listed.map((row: { name: string }) => row.name)).toEqual([
      alfa.name,
      bravo.name,
    ]);
    expect(listed[1]).toEqual({
      id: bravo.id,
      name: bravo.name,
      description: "About bravo",
      itemCount: 2,
      availability: "theme",
      gateLevelNumber: null,
    });
    expect(listed[0].gateLevelNumber).toBe(w.level.levelNumber);

    const refused: [string, string, number][] = [
      ["no language", "", 422],
      ["a language that is not an id", "language=es", 422],
      // There is no way to ask for anyone's personal decks.
      ["a kind", `${mine}&kind=personal`, 422],
      ["an owner", `${mine}&owner=${adminUserId}`, 422],
      ["an unknown parameter", `${mine}&search=x`, 422],
      [
        "a language that does not exist",
        "language=00000000-0000-4000-8000-000000000000",
        404,
      ],
    ];
    for (const [name, query, status] of refused)
      expect((await get(query)).status(), name).toBe(status);
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme, in the list and in the specialist dialog", async ({
    page,
  }) => {
    const w = await shelf(1);
    const mine = await deck({ name: `${TAG} Mine`, itemIds: [w.items[0]!] });
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(rowOf(page, mine)).toBeVisible();
    await shot(page, "decks-list-dark");

    await page.getByRole("button", { name: "Add deck" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a Polyglot deck" });
    await expect(dialog).toBeVisible();
    await shot(page, "decks-add-dialog-dark");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("lays out at 390px without scrolling the page sideways — the list keeps each deck's name and size, and Add deck stays in reach", async ({
    page,
  }) => {
    const w = await shelf(1);
    const long = await deck({
      name: `${TAG} A fairly long deck name that has to wrap onto more than one line`,
      description: "A description that gives way first on a phone",
      itemIds: [w.items[0]!],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Three short columns fit the table's own frame, so nothing is scrolled out
    // of sight inside it.
    expect(
      await page.evaluate(() => {
        const frame = document.querySelector(
          ".RaDataTable-tableWrapper",
        ) as HTMLElement;
        return frame.scrollWidth - frame.clientWidth;
      }),
    ).toBeLessThanOrEqual(0);
    // The description gives way first; the deck's name and its size stay.
    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["Deck", "Items", "Availability"],
    );
    await expect(rowOf(page, long)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add deck" }).first(),
    ).toBeInViewport({ ratio: 1 });
    await shot(page, "decks-list-mobile");

    await page.getByRole("button", { name: "Add deck" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a Polyglot deck" });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "decks-add-dialog-mobile");
  });
});
