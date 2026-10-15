import { expect, test, type Page } from "@playwright/test";

import {
  clearE2EMappingEntry,
  countE2EItemAudits,
  getE2EAdminScope,
  getE2EAdminUserId,
  getE2EItemRows,
  getE2EMappings,
  removeBulkFixtureItems,
  removeSeededGroups,
  removeSeededLevels,
  removeSeededMappings,
  seedBulkItems,
  seedGroup,
  seedLevel,
  seedMappings,
  seedOtherLanguage,
  setE2EAdminRole,
  type E2ELevel,
  type SeededMappings,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";
import { spendRateBudget } from "../support/rate-budget";

/**
 * Spec 26 Unit 9 — the dictionary mapping queue, rendered through React Admin,
 * against the real signed-in app and the isolated E2E database. The sense,
 * pronunciation and manual-override dialogs live on the word's own page and are
 * unchanged; what is exercised here is the queue that finds the work, and the one
 * command it carries — the batch confirmation of reviewed matches.
 *
 * Every level, group, word and mapping this file needs is inserted directly (see
 * `support/e2e-admin.ts`), under a throwaway level numbered well away from
 * anything seeded, and removed after each test — mappings first (they name the
 * words), then words, groups, levels. Roles other than admin flip the permanent
 * E2E admin identity's *database* role and restore it after every test.
 *
 * Confirming a batch is one `admin-mutation` (30 / 60s) — a real control, never
 * relaxed. The spec spends from it through the shared account in
 * `support/rate-budget.ts` and waits out the window rather than tripping it.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PAGE = "/admin/dictionary";
const API = "/api/v1/admin/dictionary";

const RUN = crypto.randomUUID().slice(0, 6);
/** Every word this run makes starts with this — so a test finds, and removes, exactly its own. */
const TAG = `u9-${RUN}`;
const word = (name: string) => `${TAG}-${name}`;

test.use({ storageState: ADMIN_AUTH });
// Waiting out a rate-limit window can take a minute; a cold `next dev` compile
// of a route can take another.
test.describe.configure({ mode: "serial", timeout: 180_000 });

let languageId = "";
let createdLevels: string[] = [];
let createdGroups: string[] = [];
let createdItems: string[] = [];
let createdMappings: { seeded: SeededMappings; itemIds: string[] }[] = [];

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  // Mappings name the words, words name a group and a level, groups name a level.
  for (const { seeded, itemIds } of createdMappings)
    await removeSeededMappings(seeded, itemIds);
  await removeBulkFixtureItems(createdItems);
  await removeSeededGroups(createdGroups);
  await removeSeededLevels(createdLevels);
  createdMappings = [];
  createdItems = [];
  createdGroups = [];
  createdLevels = [];
});

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const NAMES = ["alfa", "bravo", "charlie", "delta", "echo"] as const;
type Name = (typeof NAMES)[number];

type World = { level: E2ELevel; ids: Record<Name, string> };

/**
 * One throwaway level holding five published words — in the alphabetical order
 * the queue lists them — each in a different place in the dictionary workflow:
 * a candidate matched automatically (alfa), one waiting for review (bravo), one
 * an Admin already chose and locked (charlie), a word nothing matched (delta),
 * and a word nothing has ever looked at, with no mapping row at all (echo).
 */
async function world(): Promise<World> {
  const level = await seedLevel();
  createdLevels.push(level.id);
  const group = await seedGroup(level.id, { name: `${TAG} group` });
  createdGroups.push(group.id);
  const itemIds = await seedBulkItems(
    level.id,
    group.id,
    NAMES.map((name) => ({ term: word(name), status: "published" as const })),
  );
  createdItems.push(...itemIds);
  const ids = Object.fromEntries(
    NAMES.map((name, index) => [name, itemIds[index]!]),
  ) as Record<Name, string>;
  const seeded = await seedMappings([
    {
      itemId: ids.alfa,
      matchStatus: "auto_matched",
      confidence: "high",
      entryLemma: "lema-alfa",
    },
    {
      itemId: ids.bravo,
      matchStatus: "review_required",
      reviewReason: "multiple_candidates",
      entryLemma: "lema-bravo",
    },
    {
      itemId: ids.charlie,
      matchStatus: "manual",
      manualLock: true,
      entryLemma: "lema-charlie",
    },
    { itemId: ids.delta, matchStatus: "unmatched" },
  ]);
  createdMappings.push({ seeded, itemIds });
  return { level, ids };
}

/** A level of `count` published words nothing has looked at — for paging. */
async function plainWords(count: number): Promise<E2ELevel> {
  const level = await seedLevel();
  createdLevels.push(level.id);
  const group = await seedGroup(level.id, { name: `${TAG} group` });
  createdGroups.push(group.id);
  const itemIds = await seedBulkItems(
    level.id,
    group.id,
    Array.from({ length: count }, (_, index) => ({
      term: word(`w${String(index + 1).padStart(2, "0")}`),
      status: "published" as const,
    })),
  );
  createdItems.push(...itemIds);
  return level;
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

const listUrl = (level: Pick<E2ELevel, "id">, extra = "") =>
  `${PAGE}?language=${languageId}&level=${level.id}${extra}`;

const table = (page: Page) =>
  page.getByRole("table", { name: "Dictionary mapping queue" });
// `has` is evaluated inside each row, so its locator must start at the page —
// one chained from the table would look for a table inside a row.
const rowOf = (page: Page, term: string) =>
  table(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("link", { name: `Review ${term}`, exact: true }),
    });
const toolbar = (page: Page) =>
  page.getByRole("group", { name: "Actions for the selected words" });
const pager = (page: Page) =>
  page.getByRole("navigation", { name: "Pagination" });

/** The words listed, in the order listed (each row's Review link names its word). */
const reviewLabels = (page: Page) =>
  table(page)
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("aria-label")));
const shown = async (page: Page) => (await reviewLabels(page)).length;

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
    page.getByRole("heading", { name: "Dictionary", exact: true, level: 1 }),
  ).toBeVisible();
  // Whatever the queue ends up showing: the table, or one of its empty states.
  await expect(
    table(page)
      .or(page.getByText("There is nothing more on this page"))
      .or(page.getByText("No vocabulary matches these filters"))
      .or(page.getByText("No vocabulary in this language yet")),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function open(page: Page, level: Pick<E2ELevel, "id">, extra = "") {
  await page.goto(listUrl(level, extra));
  await listReady(page);
}

async function choose(page: Page, field: RegExp, option: string) {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/* -------------------------------------------------------------------------- */
/* The queue                                                                  */
/* -------------------------------------------------------------------------- */

test.describe("the queue", () => {
  test("lists a level's words with where each mapping stands, and only a candidate not yet confirmed can be ticked", async ({
    page,
  }) => {
    const w = await world();
    await open(page, w.level);

    // The queue's one order — level, group, then the word.
    expect(await reviewLabels(page)).toEqual(
      NAMES.map((name) => `Review ${word(name)}`),
    );

    const alfa = rowOf(page, word("alfa"));
    await expect(alfa).toContainText("Auto-matched");
    await expect(alfa).toContainText("High");
    await expect(alfa).toContainText("lema-alfa");
    await expect(alfa.getByRole("checkbox")).toBeEnabled();

    const bravo = rowOf(page, word("bravo"));
    await expect(bravo).toContainText("Needs review");
    await expect(bravo).toContainText("Several matching entries");
    await expect(bravo.getByRole("checkbox")).toBeEnabled();

    // Already chosen by a person and locked: nothing left to confirm.
    const charlie = rowOf(page, word("charlie"));
    await expect(charlie).toContainText("Manual");
    await expect(
      charlie.getByLabel("Locked against automatic replacement"),
    ).toBeVisible();
    await expect(charlie.getByRole("checkbox")).toBeDisabled();

    // Searched and empty, and never searched, are told apart.
    const delta = rowOf(page, word("delta"));
    await expect(delta).toContainText("No match");
    await expect(delta.getByRole("checkbox")).toBeDisabled();
    const echo = rowOf(page, word("echo"));
    await expect(echo).toContainText("Not imported");
    await expect(echo.getByRole("checkbox")).toBeDisabled();

    // The numbers above the table, with the never-looked-at word counted.
    const counts = page.getByLabel("Mapping counts");
    for (const label of [
      "No match",
      "Not imported",
      "Auto-matched",
      "Needs review",
      "Manual",
      "Never matched",
    ])
      await expect(counts).toContainText(label);
    await noHash(page);
    await shot(page, "dictionary-list-light");

    // "Select all" takes the two that can be confirmed, and no other row.
    await table(page).getByRole("checkbox").first().check();
    await expect(toolbar(page)).toContainText("2 words selected");
    for (const row of [charlie, delta, echo])
      await expect(row.getByRole("checkbox")).not.toBeChecked();
    await shot(page, "dictionary-selected-light");
    await toolbar(page).getByRole("button", { name: "Unselect" }).click();
    await expect(toolbar(page)).toHaveCount(0);

    // The word's own page is where every decision is made.
    await alfa.getByRole("link", { name: `Review ${word("alfa")}` }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/curriculum/items/${w.ids.alfa}$`),
    );
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("filters live in the URL — they survive a reload, Back undoes them, a selection never outlives them, and the counts stay the language's", async ({
    page,
  }) => {
    const w = await world();
    await open(page, w.level);
    const countsBefore = await page.getByLabel("Mapping counts").innerText();

    await choose(page, /Match state/, "Needs review");
    await expect(page).toHaveURL(/status=review_required/);
    await expect(page).toHaveURL(new RegExp(`level=${w.level.id}`));
    await expect
      .poll(() => reviewLabels(page))
      .toEqual([`Review ${word("bravo")}`]);
    // The header's numbers are the language's, whatever the filters.
    expect(await page.getByLabel("Mapping counts").innerText()).toBe(
      countsBefore,
    );

    await page.reload();
    await listReady(page);
    await expect
      .poll(() => reviewLabels(page))
      .toEqual([`Review ${word("bravo")}`]);
    await expect(
      page.getByRole("combobox", { name: /Match state/ }),
    ).toHaveText("Needs review");

    await page.goBack();
    await listReady(page);
    await expect(page).not.toHaveURL(/status=/);
    await expect.poll(() => shown(page)).toBe(5);

    // A filter nothing satisfies is an empty state of its own, not a blank table.
    await choose(page, /Part of speech/, "verb");
    await expect(page).toHaveURL(/pos=verb/);
    await expect(
      page.getByText("No vocabulary matches these filters"),
    ).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    await shot(page, "dictionary-filtered-empty-light");
    // The empty option reads "All parts of speech"; React Admin names it "Clear value".
    await choose(page, /Part of speech/, "Clear value");
    await expect.poll(() => shown(page)).toBe(5);

    // What was ticked belongs to the view it was ticked in.
    await rowOf(page, word("alfa")).getByRole("checkbox").check();
    await expect(toolbar(page)).toContainText("1 word selected");
    await choose(page, /Match state/, "Auto-matched");
    await expect(toolbar(page)).toHaveCount(0);
    await expect(
      rowOf(page, word("alfa")).getByRole("checkbox"),
    ).not.toBeChecked();
    await noHash(page);
  });

  test("pages 25 at a time with the real total; a page past the end says so, and an offset between pages lands on a whole one", async ({
    page,
  }) => {
    const level = await plainWords(27);
    await open(page, level);

    await expect(pager(page)).toContainText("1–25 of 27");
    expect(await shown(page)).toBe(25);
    await expect(
      pager(page).getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    await pager(page).getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/offset=25/);
    await expect(pager(page)).toContainText("26–27 of 27");
    await expect.poll(() => shown(page)).toBe(2);
    await expect(
      pager(page).getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    await shot(page, "dictionary-page-2-light");

    await pager(page).getByRole("button", { name: "Previous page" }).click();
    await expect(pager(page)).toContainText("1–25 of 27");
    await expect(page).not.toHaveURL(/offset=/);

    // Far past the end: not "no vocabulary", which would be untrue — a way back.
    await open(page, level, "&offset=1000");
    await expect(
      page.getByText("There is nothing more on this page"),
    ).toBeVisible();
    await expect(
      pager(page).getByRole("button", { name: "Previous page" }),
    ).toBeEnabled();
    await shot(page, "dictionary-past-the-end-light");

    // 30 is not the start of a page; it is read as the page that holds it.
    await open(page, level, "&offset=30");
    await expect(pager(page)).toContainText("26–27 of 27");
  });
});

/* -------------------------------------------------------------------------- */
/* Confirming a batch                                                         */
/* -------------------------------------------------------------------------- */

test.describe("confirming reviewed matches", () => {
  test("confirms exactly the selected words — locked, audited once each, and nothing published", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const w = await world();
    const adminId = await getE2EAdminUserId();
    const all = NAMES.map((name) => w.ids[name]);
    const itemsBefore = await getE2EItemRows(all);

    await open(page, w.level);
    await rowOf(page, word("alfa")).getByRole("checkbox").check();
    await rowOf(page, word("bravo")).getByRole("checkbox").check();
    await expect(toolbar(page)).toContainText("2 words selected");
    await toolbar(page)
      .getByRole("button", { name: "Confirm selected" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Confirm 2 mappings?" });
    // What it will do is said before anything is sent.
    await expect(dialog).toContainText(
      "a published word is not changed until someone publishes that draft",
    );
    const listed = dialog.getByRole("list", { name: "Words to confirm" });
    await expect(listed).toContainText(word("alfa"));
    await expect(listed).toContainText("lema-alfa");
    await expect(listed).toContainText(word("bravo"));
    await shot(page, "dictionary-confirm-dialog-light");

    // Nothing has been sent yet.
    expect(
      (await getE2EMappings([w.ids.alfa, w.ids.bravo])).map(
        (m) => m?.matchStatus,
      ),
    ).toEqual(["auto_matched", "review_required"]);

    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Confirmed 2 mappings.")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);

    // The queue shows what the database now holds: both are chosen and locked.
    for (const name of ["alfa", "bravo"] as const) {
      const row = rowOf(page, word(name));
      await expect(row).toContainText("Manual");
      await expect(
        row.getByLabel("Locked against automatic replacement"),
      ).toBeVisible();
      await expect(row.getByRole("checkbox")).toBeDisabled();
    }
    const [alfa, bravo, charlie, delta, echo] = await getE2EMappings(all);
    for (const confirmed of [alfa, bravo]) {
      expect(confirmed).toMatchObject({
        matchStatus: "manual",
        manualLock: true,
        reviewReason: null,
        mappedByUserId: adminId,
      });
      expect(confirmed?.dictionaryEntryId).not.toBeNull();
    }
    // Everything else is as it was.
    expect(charlie).toMatchObject({
      matchStatus: "manual",
      mappedByUserId: adminId,
    });
    expect(delta).toMatchObject({
      matchStatus: "unmatched",
      manualLock: false,
    });
    expect(echo).toBeNull();

    // One audit event per word that changed — and none for the rest.
    for (const name of ["alfa", "bravo"] as const)
      expect(
        await countE2EItemAudits("DICTIONARY_MAPPING_CONFIRMED", w.ids[name]),
      ).toBe(1);
    for (const name of ["charlie", "delta", "echo"] as const)
      expect(
        await countE2EItemAudits("DICTIONARY_MAPPING_CONFIRMED", w.ids[name]),
      ).toBe(0);

    // Confirming never publishes anything: every word is still the published one.
    const itemsAfter = await getE2EItemRows(all);
    expect(itemsAfter.map((row) => row?.status)).toEqual(
      itemsBefore.map((row) => row?.status),
    );
    for (const id of all)
      expect(await countE2EItemAudits("CURRICULUM_ITEM_PUBLISHED", id)).toBe(0);
    await noHash(page);
  });

  test("a word whose candidate vanished behind the page refuses the whole batch — nothing is confirmed — and offers a reload, not a retry", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const w = await world();
    await open(page, w.level);
    await rowOf(page, word("alfa")).getByRole("checkbox").check();
    await rowOf(page, word("bravo")).getByRole("checkbox").check();

    // Another Admin rematches bravo while this page still shows its old candidate.
    await clearE2EMappingEntry(w.ids.bravo);

    await toolbar(page)
      .getByRole("button", { name: "Confirm selected" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Confirm 2 mappings?" });
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect(dialog.getByRole("alert")).toContainText(
      "There is no matched entry to confirm.",
    );
    // A stale view is answered by looking again, never by sending it a second time.
    await expect(
      dialog.getByRole("button", { name: "Reload the list" }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
    await shot(page, "dictionary-confirm-stale-light");

    // All or nothing: alfa, which could have been confirmed, was not.
    const [alfa] = await getE2EMappings([w.ids.alfa]);
    expect(alfa).toMatchObject({
      matchStatus: "auto_matched",
      manualLock: false,
    });
    expect(
      await countE2EItemAudits("DICTIONARY_MAPPING_CONFIRMED", w.ids.alfa),
    ).toBe(0);

    await dialog.getByRole("button", { name: "Reload the list" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(rowOf(page, word("bravo"))).toContainText("No match");
    await expect(
      rowOf(page, word("bravo")).getByRole("checkbox"),
    ).toBeDisabled();
    await expect(
      rowOf(page, word("alfa")).getByRole("checkbox"),
    ).not.toBeChecked();
    await expect(rowOf(page, word("alfa")).getByRole("checkbox")).toBeEnabled();
  });
});

/* -------------------------------------------------------------------------- */
/* Who may use it                                                             */
/* -------------------------------------------------------------------------- */

test.describe("who may use it", () => {
  test("a writer works the queue as before; a developer, a learner and a visitor are refused by the page and the endpoint", async ({
    page,
    browser,
  }) => {
    const w = await world();
    const url = `${API}?language=${languageId}&level=${w.level.id}`;

    // A writer finds and confirms mappings, as they always could.
    await setE2EAdminRole("writer");
    await open(page, w.level);
    const alfaBox = rowOf(page, word("alfa")).getByRole("checkbox");
    await expect(alfaBox).toBeEnabled();
    await alfaBox.check();
    await expect(
      toolbar(page).getByRole("button", { name: "Confirm selected" }),
    ).toBeEnabled();
    await shot(page, "dictionary-writer-light");
    await renewSession(page);
    const me = await page.request.get("/api/v1/admin/me");
    const { resources } = (await me.json()).data.permissions;
    expect(resources.dictionary).toEqual(["list", "edit"]);
    // The owner's 2026-10-14 decisions: a writer reads the official decks (and
    // cannot manage them) and has no part of Imports.
    expect(resources.decks).toEqual(["list"]);
    expect(resources.imports).toBeUndefined();
    expect((await page.request.get(url)).status()).toBe(200);

    // A developer is let into the console — just not into curriculum.
    await setE2EAdminRole("developer");
    expect((await page.goto(listUrl(w.level)))?.status()).toBe(403);
    await renewSession(page);
    expect((await page.request.get(url)).status()).toBe(403);

    // A learner, and somebody not signed in at all.
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

    // Nobody got anywhere: nothing was confirmed.
    const [alfa] = await getE2EMappings([w.ids.alfa]);
    expect(alfa?.matchStatus).toBe("auto_matched");
  });

  test("the endpoint reads one language at a time, refuses what it does not honour, and is never cached", async ({
    page,
  }) => {
    const w = await world();
    const other = await seedOtherLanguage(word("other"));
    try {
      await renewSession(page);
      const get = (query: string) => page.request.get(`${API}?${query}`);
      const mine = `language=${languageId}`;

      const ok = await get(`${mine}&level=${w.level.id}`);
      expect(ok.status()).toBe(200);
      expect(ok.headers()["cache-control"]).toContain("no-store");
      const body = (await ok.json()).data;
      expect(body.total).toBe(5);
      expect(
        body.items.map((row: { displayWord: string }) => row.displayWord),
      ).toEqual(NAMES.map(word));
      expect(body.counts).toEqual(
        expect.objectContaining({ auto_matched: expect.any(Number) }),
      );

      // Another language is its own queue: its word is there, and none of ours.
      const theirs = (await (await get(`language=${other.languageId}`)).json())
        .data;
      expect(theirs.total).toBe(1);
      expect(theirs.items[0].displayWord).toBe(word("other"));

      const refused: [string, string, number][] = [
        ["no language", "", 422],
        ["an unknown parameter", `${mine}&search=x`, 422],
        ["an unknown status", `${mine}&status=bogus`, 422],
        ["a negative offset", `${mine}&offset=-1`, 422],
        ["a page over the bound", `${mine}&limit=101`, 422],
        // A level or group of another language is refused, never silently ignored.
        ["another language's level", `${mine}&level=${other.levelId}`, 422],
        ["another language's group", `${mine}&group=${other.groupId}`, 422],
        ["a region the language lacks", `${mine}&region=zz-ZZ`, 422],
        [
          "a language that does not exist",
          "language=00000000-0000-4000-8000-000000000000",
          404,
        ],
      ];
      for (const [name, query, status] of refused)
        expect((await get(query)).status(), name).toBe(status);
    } finally {
      await other.remove();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables", async ({
    page,
  }) => {
    const w = await world();
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, w.level);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(page, "dictionary-list-dark");

    await rowOf(page, word("alfa")).getByRole("checkbox").check();
    await toolbar(page)
      .getByRole("button", { name: "Confirm selected" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Confirm 1 mapping?" });
    await expect(dialog).toBeVisible();

    // MUI paints from a palette built out of the live CSS variables; if it did
    // not follow Polyglot's dark mode it would show Material's own default.
    const painted = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const resolve = (
        property: "color" | "backgroundColor",
        token: string,
      ) => {
        probe.style[property] = `var(${token})`;
        return getComputedStyle(probe)[property];
      };
      const paper = document.querySelector('[role="dialog"]') as HTMLElement;
      const title = document.querySelector(
        "#confirm-mappings-title",
      ) as HTMLElement;
      const result = {
        paper: getComputedStyle(paper).backgroundColor,
        expectedPaper: resolve("backgroundColor", "--bg-surface"),
        title: getComputedStyle(title).color,
        expectedTitle: resolve("color", "--text-primary"),
      };
      probe.remove();
      return result;
    });
    expect(painted.paper).toBe(painted.expectedPaper);
    expect(painted.title).toBe(painted.expectedTitle);
    await shot(page, "dictionary-confirm-dialog-dark");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("lays out at 390px without scrolling the page sideways — the queue, its selection bar, and the question", async ({
    page,
  }) => {
    const w = await world();
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, w.level);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // What the screen is for stays on screen: the word, where its mapping
    // stands, and the way in. The table keeps inside its own frame.
    expect(
      await page.evaluate(() => {
        const frame = document.querySelector(
          ".RaDataTable-tableWrapper",
        ) as HTMLElement;
        return frame.scrollWidth - frame.clientWidth;
      }),
    ).toBeLessThanOrEqual(0);
    const alfa = rowOf(page, word("alfa"));
    await expect(alfa.getByText("Auto-matched")).toBeInViewport({ ratio: 1 });
    await expect(
      alfa.getByRole("link", { name: `Review ${word("alfa")}` }),
    ).toBeInViewport({ ratio: 1 });
    await shot(page, "dictionary-list-mobile");

    await alfa.getByRole("checkbox").check();
    await expect(
      toolbar(page).getByRole("button", { name: "Confirm selected" }),
    ).toBeInViewport({ ratio: 1 });
    await toolbar(page)
      .getByRole("button", { name: "Confirm selected" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Confirm 1 mapping?" });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "dictionary-confirm-dialog-mobile");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
});
