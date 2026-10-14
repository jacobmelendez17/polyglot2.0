import { expect, test, type Page } from "@playwright/test";

import {
  getE2EAdminScope,
  getE2EItemRows,
  getE2ELevelOrder,
  countE2EItemAudits,
  publishBehindTheirBack,
  removeBulkFixtureItems,
  removeSeededGroups,
  removeSeededLevels,
  seedBulkItems,
  seedGroup,
  seedLevel,
  seedOtherLanguage,
  setE2EAdminRole,
  type BulkFixtureItem,
  type E2EGroup,
  type E2ELevel,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";
import { spendRateBudget } from "../support/rate-budget";

/**
 * Spec 26 Unit 7 — the curriculum list's bulk commands (publish, archive, move
 * to a level or a group) and their link to the specialist ordering tools,
 * against the real signed-in app and the isolated E2E database.
 *
 * Every test builds its own two throwaway levels (numbered from 700, far from
 * anything seeded) with a group in each, puts the items it needs in them in
 * exactly the states it needs — pending, published, published with an open
 * edit, archived, vocabulary and grammar — and removes it all afterwards: items
 * first, then groups, then levels. Nothing the other specs read is touched.
 * Roles other than admin flip the permanent E2E admin identity's *database*
 * role and restore it after every test.
 *
 * Publishing is rate limited as `admin-publish` (10 / 60s) and every other
 * bulk command as `admin-mutation` (30 / 60s) — real controls, never relaxed.
 * The spec spends from them through the shared account in
 * `support/rate-budget.ts` and waits out the window rather than tripping it.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const API = "/api/v1/admin/curriculum";
const PAGE = "/admin/curriculum";

type Command = "bulk-publish" | "bulk-archive" | "bulk-move";
const COMMANDS: Command[] = ["bulk-publish", "bulk-archive", "bulk-move"];

/** Every item this file makes carries it, so a list can be searched down to exactly them. */
const TAG = `zb${crypto.randomUUID().slice(0, 6)}`;
const t = (name: string) => `${TAG}-${name}`;

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial" });

let languageId = "";
let createdLevels: string[] = [];
let createdGroups: string[] = [];
let createdItems: string[] = [];

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  // Children before parents: items name a group and a level, groups name a level.
  await removeBulkFixtureItems(createdItems);
  await removeSeededGroups(createdGroups);
  await removeSeededLevels(createdLevels);
  createdItems = [];
  createdGroups = [];
  createdLevels = [];
});

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

type World = { a: E2ELevel; b: E2ELevel; ga: E2EGroup; gb: E2EGroup };

/** Two levels, each with a group — for a command that moves things between them. */
async function world(): Promise<World> {
  const a = await seedLevel();
  const b = await seedLevel();
  createdLevels.push(a.id, b.id);
  const ga = await seedGroup(a.id, { name: `${TAG} group A` });
  const gb = await seedGroup(b.id, { name: `${TAG} group B` });
  createdGroups.push(ga.id, gb.id);
  return { a, b, ga, gb };
}

async function items(
  level: E2ELevel,
  group: E2EGroup,
  specs: BulkFixtureItem[],
): Promise<string[]> {
  const ids = await seedBulkItems(level.id, group.id, specs);
  createdItems.push(...ids);
  return ids;
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

const listUrl = (extra = "") =>
  `${PAGE}?language=${languageId}&search=${TAG}${extra}`;

const table = (page: Page) =>
  page.getByRole("table", { name: "Curriculum items" });
const rowOf = (page: Page, term: string) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: term, exact: true }) });
const toolbar = (page: Page) =>
  page.getByRole("group", { name: "Actions for the selected items" });
const action = (page: Page, name: string) =>
  toolbar(page).getByRole("button", { name, exact: true });
const dialog = (page: Page, name: string | RegExp) =>
  page.getByRole("dialog", { name });

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // A dialog fades in; a picture taken mid-fade shows nothing useful.
  const container = page.locator(".MuiDialog-container");
  if ((await container.count()) > 0)
    await expect(container).toHaveCSS("opacity", "1");
  // A select's menu fades out over the dialog it was opened from.
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function listReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function open(page: Page, extra = ""): Promise<void> {
  await page.goto(listUrl(extra));
  await listReady(page);
}

/** Ticks each named row, and waits for the bar. */
async function tick(page: Page, ...terms: string[]): Promise<void> {
  for (const term of terms)
    await rowOf(page, term).getByRole("checkbox").check();
  await expect(toolbar(page)).toBeVisible();
}

/** The labels of the items listed, in order. */
const labels = (page: Page) => table(page).getByRole("link").allInnerTexts();

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

/** The headers a real page from this app attaches to a same-origin `fetch`. */
const fromThisApp = (origin: string, contentType = "application/json") => ({
  origin,
  "sec-fetch-site": "same-origin",
  "content-type": contentType,
});
const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Publish                                                                    */
/* -------------------------------------------------------------------------- */

test.describe("publish", () => {
  test("a mixed selection cannot be published; narrowing it is the person's choice, and the publish then does exactly that", async ({
    page,
  }) => {
    const w = await world();
    const [pendingWord, pendingRule, live] = await items(w.a, w.ga, [
      { term: t("pend-word"), status: "pending" },
      { term: t("pend-rule"), type: "grammar", status: "pending" },
      { term: t("live"), status: "published" },
    ]);

    await open(page);
    await tick(page, t("pend-word"), t("pend-rule"), t("live"));

    // Publish needs every selected item Pending; it says so and offers the way out.
    await expect(action(page, "Publish")).toBeDisabled();
    await expect(toolbar(page)).toContainText(
      "Publish needs every selected item to be Pending — 1 isn't.",
    );
    await shot(page, "bulk-bar-mixed-light");

    await toolbar(page)
      .getByRole("button", { name: "Select only the 2 Pending" })
      .click();
    await expect(toolbar(page)).toContainText("2 items selected");
    await expect(
      rowOf(page, t("live")).getByRole("checkbox"),
    ).not.toBeChecked();
    await expect(action(page, "Publish")).toBeEnabled();

    await action(page, "Publish").click();
    const confirm = dialog(page, "Publish 2 items?");
    await expect(confirm).toContainText(
      "These items become visible to learners for the first time. All publish together, or none do.",
    );
    await expect(
      confirm.getByRole("list", { name: "Items to publish" }),
    ).toContainText(t("pend-word"));
    await shot(page, "bulk-publish-dialog-light");

    // Nothing has been sent yet.
    const before = await getE2EItemRows([pendingWord!, pendingRule!, live!]);
    expect(before.map((row) => row?.status)).toEqual([
      "pending",
      "pending",
      "published",
    ]);

    await spendRateBudget("admin-publish");
    await confirm.getByRole("button", { name: "Publish", exact: true }).click();

    await expect(page.getByText("Published 2 items.")).toBeVisible();
    await expect(confirm).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(
      rowOf(page, t("pend-word")).getByText("Published"),
    ).toBeVisible();
    await expect(
      rowOf(page, t("pend-rule")).getByText("Published"),
    ).toBeVisible();

    const after = await getE2EItemRows([pendingWord!, pendingRule!, live!]);
    expect(after.map((row) => row?.status)).toEqual([
      "published",
      "published",
      "published",
    ]);
    // The two that were Pending were published (a new version); the one that
    // was already live was not touched.
    expect(after[0]!.version).toBeGreaterThan(before[0]!.version);
    expect(after[1]!.version).toBeGreaterThan(before[1]!.version);
    expect(after[2]!.version).toBe(before[2]!.version);
    expect(
      await countE2EItemAudits("CURRICULUM_ITEM_PUBLISHED", pendingWord!),
    ).toBe(1);
    expect(
      await countE2EItemAudits("CURRICULUM_ITEM_PUBLISHED", pendingRule!),
    ).toBe(1);
    expect(await countE2EItemAudits("CURRICULUM_ITEM_PUBLISHED", live!)).toBe(
      0,
    );
    noHash(page);
  });

  test("a bulk publish takes its items out of the review queue, and only those", async ({
    page,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("q1"), status: "pending" },
      { term: t("q2"), status: "pending" },
      { term: t("q3"), status: "pending" },
    ]);
    const queued = async () => {
      await renewSession(page);
      const response = await page.request.get(
        `/api/v1/admin/review?language=${languageId}`,
      );
      expect(response.status()).toBe(200);
      const { data } = await response.json();
      return (data.items as { id: string }[]).map((row) => row.id);
    };
    for (const id of ids) expect(await queued()).toContain(id);

    await open(page);
    await tick(page, t("q1"), t("q2"));
    await action(page, "Publish").click();
    await spendRateBudget("admin-publish");
    await dialog(page, "Publish 2 items?")
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await expect(page.getByText("Published 2 items.")).toBeVisible();

    // What the Review screen reads: the two are gone, the third still waits.
    const after = await queued();
    expect(after).not.toContain(ids[0]);
    expect(after).not.toContain(ids[1]);
    expect(after).toContain(ids[2]);
  });

  test("an item published behind the list's back refuses the whole batch — nothing is half-published — and Reload shows the truth", async ({
    page,
  }) => {
    const w = await world();
    const [first, second] = await items(w.a, w.ga, [
      { term: t("one"), status: "pending" },
      { term: t("two"), status: "pending" },
    ]);

    await open(page);
    await tick(page, t("one"), t("two"));
    await action(page, "Publish").click();
    const confirm = dialog(page, "Publish 2 items?");
    await expect(confirm).toBeVisible();

    // Somebody else publishes the second while this dialog is open.
    const stale = await getE2EItemRows([second!]);
    await publishBehindTheirBack(second!, stale[0]!.version);

    await spendRateBudget("admin-publish");
    await confirm.getByRole("button", { name: "Publish", exact: true }).click();

    await expect(confirm.getByRole("alert")).toContainText("no longer Pending");
    await shot(page, "bulk-publish-stale-light");
    // A stale view is answered with a reload, never a blind retry.
    await expect(
      confirm.getByRole("button", { name: "Try again" }),
    ).toHaveCount(0);
    await expect(
      confirm.getByRole("button", { name: "Publish", exact: true }),
    ).toHaveCount(0);

    // The first was not published just because it could have been.
    const [one, two] = await getE2EItemRows([first!, second!]);
    expect(one!.status).toBe("pending");
    expect(two!.status).toBe("published");
    expect(await countE2EItemAudits("CURRICULUM_ITEM_PUBLISHED", first!)).toBe(
      0,
    );

    await confirm.getByRole("button", { name: "Reload the list" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(rowOf(page, t("one")).getByText("Pending")).toBeVisible();
    await expect(rowOf(page, t("two")).getByText("Published")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Archive                                                                    */
/* -------------------------------------------------------------------------- */

test.describe("archive", () => {
  test("says what it will do to this selection, then archives live, edited, pending and grammar items together and leaves an archived one alone", async ({
    page,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("live"), status: "published" },
      { term: t("edited"), status: "draft" },
      { term: t("waiting"), status: "pending" },
      { term: t("rule"), type: "grammar", status: "published" },
      { term: t("old"), status: "archived" },
    ]);
    const [live, edited, waiting, rule, old] = ids;
    const before = await getE2EItemRows(ids);
    expect(before[1]!.hasDraft).toBe(true);

    await open(page);
    // The header checkbox takes the whole page.
    await table(page).getByRole("checkbox").first().check();
    await expect(toolbar(page)).toContainText("5 items selected");

    await action(page, "Archive").click();
    const confirm = dialog(page, "Archive 4 items?");
    await expect(confirm).toContainText(
      "Archiving withdraws items from learners' browsing and from new lessons.",
    );
    await expect(confirm).toContainText("All archive together, or none do.");
    await expect(confirm).toContainText(
      "3 items are live to learners and will be withdrawn from them.",
    );
    await expect(confirm).toContainText(
      "1 item has unpublished changes, which archiving discards.",
    );
    await expect(confirm).toContainText(
      "1 item is already archived and will be left as it is.",
    );
    await shot(page, "bulk-archive-dialog-light");

    await spendRateBudget("admin-mutation");
    await confirm.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(
      page.getByText("Archived 4 items (1 already archived)."),
    ).toBeVisible();
    await expect(confirm).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(rowOf(page, t("live")).getByText("Archived")).toBeVisible();

    const after = await getE2EItemRows(ids);
    expect(after.map((row) => row?.status)).toEqual([
      "archived",
      "archived",
      "archived",
      "archived",
      "archived",
    ]);
    // The open edit is discarded; nothing else about the items changed.
    expect(after[1]!.hasDraft).toBe(false);
    for (const [index, row] of after.entries()) {
      expect(row!.position, `position of item ${index}`).toBe(
        before[index]!.position,
      );
      expect(row!.levelId).toBe(before[index]!.levelId);
    }
    for (const id of [live, edited, waiting, rule]) {
      expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", id!)).toBe(1);
    }
    // The one that was already archived is not archived again.
    expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", old!)).toBe(0);
  });

  test("an item deleted behind the list's back refuses the whole batch — the others are untouched", async ({
    page,
  }) => {
    const w = await world();
    const [kept, gone] = await items(w.a, w.ga, [
      { term: t("kept"), status: "published" },
      { term: t("gone"), status: "published" },
    ]);

    await open(page);
    await tick(page, t("kept"), t("gone"));
    await action(page, "Archive").click();
    const confirm = dialog(page, "Archive 2 items?");
    await expect(confirm).toBeVisible();

    await removeBulkFixtureItems([gone!]);
    createdItems = createdItems.filter((id) => id !== gone);

    await spendRateBudget("admin-mutation");
    await confirm.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(confirm.getByRole("alert")).toContainText(
      "One of the selected items no longer exists",
    );
    const [row] = await getE2EItemRows([kept!]);
    expect(row!.status).toBe("published");
    expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", kept!)).toBe(0);

    await confirm.getByRole("button", { name: "Reload the list" }).click();
    await expect(confirm).toHaveCount(0);
    await expect.poll(() => labels(page)).toEqual([t("kept")]);
  });

  test("a lost answer is retried under the same key, and the server answers from what it stored: one archive, one audit event", async ({
    page,
  }) => {
    const w = await world();
    const [one, two] = await items(w.a, w.ga, [
      { term: t("one"), status: "published" },
      { term: t("two"), status: "published" },
    ]);

    // The server does the work, and the browser never hears back.
    const keys: string[] = [];
    await page.route(`**${API}/bulk-archive`, async (route) => {
      keys.push(route.request().postDataJSON().idempotencyKey);
      if (keys.length === 1) {
        await route.fetch();
        await route.abort("connectionfailed");
      } else {
        await route.continue();
      }
    });

    await open(page);
    await tick(page, t("one"), t("two"));
    await action(page, "Archive").click();
    const confirm = dialog(page, "Archive 2 items?");

    await spendRateBudget("admin-mutation", 2);
    await confirm.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(confirm.getByRole("alert")).toContainText(
      "Couldn't reach the server",
    );
    // It really did happen.
    const [done] = await getE2EItemRows([one!]);
    expect(done!.status).toBe("archived");
    await shot(page, "bulk-archive-lost-answer-light");

    await confirm.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByText("Archived 2 items.")).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).toMatch(UUID);
    // Applied once: a second application would have said "already archived",
    // and recorded a second event.
    expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", one!)).toBe(1);
    expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", two!)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Move                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("move", () => {
  test("to a level: the items join the end of its order in the list's order, position and lesson priority stay one order, a grammar item loses its group, one already there is left alone", async ({
    page,
  }) => {
    const w = await world();
    const [b1, b2, bg] = await items(w.b, w.gb, [
      { term: t("b1"), status: "published" },
      { term: t("b2"), status: "published" },
      { term: t("bg"), type: "grammar", status: "published" },
    ]);
    // `a1`'s lesson priority has drifted from its position: a move repairs it.
    const [a1, a2, ag] = await items(w.a, w.ga, [
      { term: t("a1"), status: "published", lessonPriority: 77 },
      { term: t("a2"), status: "pending" },
      { term: t("ag"), type: "grammar", status: "published", groupId: w.ga.id },
    ]);
    const othersBefore = await getE2EItemRows([b1!, b2!, bg!]);

    await open(page);
    await tick(page, t("a1"), t("a2"), t("ag"), t("b1"));

    await action(page, "Move to level").click();
    const confirm = dialog(page, "Move 4 items to a level");
    await expect(
      confirm.getByRole("button", { name: "Move", exact: true }),
    ).toBeDisabled();
    await confirm.getByRole("combobox", { name: "Target level" }).click();
    await page
      .getByRole("option", { name: `Level ${w.b.levelNumber}`, exact: true })
      .click();

    await expect(confirm).toContainText(
      `3 items will move to Level ${w.b.levelNumber}, to the end of its order.`,
    );
    await expect(confirm).toContainText(
      `1 item already in Level ${w.b.levelNumber} is left where it is.`,
    );
    await expect(confirm).toContainText(
      "2 items are live to learners and will change level for them straight away.",
    );
    await expect(confirm).toContainText(
      "1 grammar item filed under a group will lose it — a group belongs to one level.",
    );
    await expect(confirm).toContainText(
      "Vocabulary keeps its group; use Move to group to change that.",
    );
    // The order is arranged on the level's own page, which the dialog links to.
    await expect(
      confirm.getByRole("link", { name: `Level ${w.b.levelNumber}'s page` }),
    ).toHaveAttribute("href", `/admin/curriculum/levels/${w.b.id}`);
    await shot(page, "bulk-move-level-dialog-light");

    await spendRateBudget("admin-mutation");
    await confirm.getByRole("button", { name: "Move", exact: true }).click();

    await expect(
      page.getByText(
        `Moved 3 items to Level ${w.b.levelNumber} (1 already there).`,
      ),
    ).toBeVisible();
    await expect(confirm).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);

    const [movedFirst, movedSecond, movedRule] = await getE2EItemRows([
      a1!,
      a2!,
      ag!,
    ]);
    // Appended after what the level already held, in the order they were listed.
    expect(movedFirst).toMatchObject({
      levelId: w.b.id,
      position: 3,
      lessonPriority: 3,
    });
    expect(movedSecond).toMatchObject({
      levelId: w.b.id,
      position: 4,
      lessonPriority: 4,
    });
    expect(movedRule).toMatchObject({
      levelId: w.b.id,
      type: "grammar",
      position: 2,
      lessonPriority: 2,
      // A group belongs to one level: it does not follow the item to another.
      groupId: null,
    });
    // Vocabulary keeps its group until it is moved to another.
    expect(movedFirst!.groupId).toBe(w.ga.id);
    // Status is not a move's business.
    expect(movedSecond!.status).toBe("pending");

    // Nothing that was already in the level moved — not even the selected one.
    expect(await getE2EItemRows([b1!, b2!, bg!])).toEqual(othersBefore);
    expect(
      (await getE2ELevelOrder(w.b.id, "vocabulary")).map((row) => row.id),
    ).toEqual([b1, b2, a1, a2]);
    expect(await getE2ELevelOrder(w.a.id, "vocabulary")).toEqual([]);
    expect(await getE2ELevelOrder(w.a.id, "grammar")).toEqual([]);
    for (const id of [a1, a2, ag]) {
      expect(await countE2EItemAudits("CURRICULUM_ITEM_MOVED", id!)).toBe(1);
    }
    expect(await countE2EItemAudits("CURRICULUM_ITEM_MOVED", b1!)).toBe(0);
  });

  test("to a group: vocabulary and grammar are filed under it; level and order stay as they were", async ({
    page,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("word"), status: "published" },
      { term: t("rule"), type: "grammar", status: "published" },
    ]);
    const before = await getE2EItemRows(ids);

    await open(page);
    await tick(page, t("word"), t("rule"));
    await action(page, "Move to group").click();
    const confirm = dialog(page, "Move 2 items to a group");
    await confirm.getByRole("combobox", { name: "Target group" }).click();
    await page
      .getByRole("option", {
        name: `L${w.b.levelNumber} — ${w.gb.name}`,
        exact: true,
      })
      .click();

    await expect(confirm).toContainText(
      `2 items will be filed under “${w.gb.name}”.`,
    );
    await expect(confirm).toContainText(
      `2 items are in a different level from this group (Level ${w.b.levelNumber}); they stay where they are.`,
    );

    await spendRateBudget("admin-mutation");
    await confirm.getByRole("button", { name: "Move", exact: true }).click();
    await expect(
      page.getByText(`Moved 2 items to “${w.gb.name}”.`),
    ).toBeVisible();

    const after = await getE2EItemRows(ids);
    for (const [index, row] of after.entries()) {
      expect(row!.groupId).toBe(w.gb.id);
      expect(row!.levelId).toBe(before[index]!.levelId);
      expect(row!.position).toBe(before[index]!.position);
      expect(row!.lessonPriority).toBe(before[index]!.lessonPriority);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The selection                                                              */
/* -------------------------------------------------------------------------- */

test.describe("the selection", () => {
  test("'select all' takes this page and no other; the command touches exactly those", async ({
    page,
  }) => {
    const w = await world();
    const terms = Array.from({ length: 22 }, (_, index) =>
      t(`p${String(index + 1).padStart(2, "0")}`),
    );
    const ids = await items(
      w.a,
      w.ga,
      terms.map((term) => ({ term, status: "published" as const })),
    );

    await open(page);
    expect(await labels(page)).toEqual(terms.slice(0, 20));
    await table(page).getByRole("checkbox").first().check();
    await expect(toolbar(page)).toContainText("20 items selected");

    await action(page, "Archive").click();
    const confirm = dialog(page, "Archive 20 items?");
    await spendRateBudget("admin-mutation");
    await confirm.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Archived 20 items.")).toBeVisible();

    const rows = await getE2EItemRows(ids);
    expect(rows.slice(0, 20).every((row) => row?.status === "archived")).toBe(
      true,
    );
    // The two on the next page were never selected, so never touched.
    expect(rows.slice(20).map((row) => row?.status)).toEqual([
      "published",
      "published",
    ]);

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect.poll(() => labels(page)).toEqual(terms.slice(20));
    await expect(toolbar(page)).toHaveCount(0);
    await expect(table(page).getByRole("checkbox").first()).not.toBeChecked();
  });

  test("the selection is gone after the page or a filter changes, and does not come back", async ({
    page,
  }) => {
    const w = await world();
    await items(
      w.a,
      w.ga,
      Array.from({ length: 22 }, (_, index) => ({
        term: t(`q${String(index + 1).padStart(2, "0")}`),
      })),
    );

    await open(page);
    await rowOf(page, t("q01")).getByRole("checkbox").check();
    await expect(toolbar(page)).toContainText("1 item selected");

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(toolbar(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect.poll(() => labels(page).then((all) => all.length)).toBe(20);
    await expect(toolbar(page)).toHaveCount(0);
    await expect(rowOf(page, t("q01")).getByRole("checkbox")).not.toBeChecked();

    await rowOf(page, t("q01")).getByRole("checkbox").check();
    await page.getByRole("combobox", { name: /Status/ }).click();
    await page.getByRole("option", { name: "Pending", exact: true }).click();
    await expect(page).toHaveURL(/status=pending/);
    await expect(toolbar(page)).toHaveCount(0);
  });

  test("can be used from the keyboard alone: Space selects, Enter opens a command, Escape cancels it, and focus comes back to where it was", async ({
    page,
  }) => {
    const w = await world();
    const [id] = await items(w.a, w.ga, [
      { term: t("one"), status: "published" },
    ]);

    await open(page);
    const box = rowOf(page, t("one")).getByRole("checkbox");
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).toBeChecked();
    await expect(toolbar(page)).toContainText("1 item selected");

    await action(page, "Archive").focus();
    await page.keyboard.press("Enter");
    const confirm = dialog(page, "Archive 1 item?");
    await expect(confirm).toBeVisible();
    // Focus is inside the dialog, not behind it.
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(confirm).toHaveCount(0);
    await expect(action(page, "Archive")).toBeFocused();
    // Cancelling changed nothing, and kept the selection.
    await expect(toolbar(page)).toContainText("1 item selected");
    const [row] = await getE2EItemRows([id!]);
    expect(row!.status).toBe("published");
  });

  test("an Admin demoted while a command is open is refused at the endpoint, offered only Close, and nothing changes", async ({
    page,
  }) => {
    const w = await world();
    const [id] = await items(w.a, w.ga, [
      { term: t("one"), status: "published" },
    ]);

    await open(page);
    await tick(page, t("one"));
    await action(page, "Archive").click();
    const confirm = dialog(page, "Archive 1 item?");
    await expect(confirm).toBeVisible();

    // Demoted while the question is on screen — the page has not heard yet.
    await setE2EAdminRole("writer");
    await confirm.getByRole("button", { name: "Archive", exact: true }).click();

    await expect(confirm.getByRole("alert")).toContainText(
      "You don't have access",
    );
    await expect(confirm.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      confirm.getByRole("button", { name: "Try again" }),
    ).toHaveCount(0);
    await shot(page, "bulk-archive-revoked-light");

    const [row] = await getE2EItemRows([id!]);
    expect(row!.status).toBe("published");
    expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", id!)).toBe(0);
    await confirm.getByRole("button", { name: "Close" }).click();
    await expect(confirm).toHaveCount(0);
  });

  test("a writer is shown no selection at all", async ({ page }) => {
    const w = await world();
    await items(w.a, w.ga, [{ term: t("only"), status: "published" }]);
    await setE2EAdminRole("writer");

    await open(page);

    await expect(rowOf(page, t("only"))).toBeVisible();
    await expect(table(page).getByRole("checkbox")).toHaveCount(0);
    await expect(toolbar(page)).toHaveCount(0);
    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["Type", "Item", "Meaning", "Level", "Group", "Status"],
    );
    // …and the item is still theirs to open.
    await expect(
      table(page).getByRole("link", { name: t("only"), exact: true }),
    ).toHaveAttribute("href", /\/admin\/curriculum\/items\//);
  });
});

/* -------------------------------------------------------------------------- */
/* The endpoints                                                              */
/* -------------------------------------------------------------------------- */

test.describe("the endpoints", () => {
  test("refuse everyone but an Admin — a writer, a developer, a learner, a visitor — and change nothing", async ({
    page,
    baseURL,
    browser,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("one"), status: "pending" },
      { term: t("two"), status: "published" },
    ]);
    const before = await getE2EItemRows(ids);
    const headers = fromThisApp(originOf(baseURL));
    const bodies: Record<Command, unknown> = {
      "bulk-publish": {
        languageId,
        itemIds: [ids[0]],
        idempotencyKey: crypto.randomUUID(),
      },
      "bulk-archive": {
        languageId,
        itemIds: ids,
        idempotencyKey: crypto.randomUUID(),
      },
      "bulk-move": {
        languageId,
        itemIds: ids,
        levelId: w.b.id,
        idempotencyKey: crypto.randomUUID(),
      },
    };

    await renewSession(page);
    for (const role of ["writer", "developer"] as const) {
      await setE2EAdminRole(role);
      for (const command of COMMANDS) {
        const response = await page.request.post(`${API}/${command}`, {
          headers,
          data: JSON.stringify(bodies[command]),
        });
        expect(response.status(), `${role} ${command}`).toBe(403);
      }
    }
    await setE2EAdminRole("admin");

    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    await renewSession(learnerPage);
    const visitor = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    for (const command of COMMANDS) {
      const asLearner = await learnerPage.request.post(`${API}/${command}`, {
        headers,
        data: JSON.stringify(bodies[command]),
      });
      expect(asLearner.status(), `learner ${command}`).toBe(403);
      const asVisitor = await visitor.request.post(`${API}/${command}`, {
        headers,
        data: JSON.stringify(bodies[command]),
      });
      expect(asVisitor.status(), `visitor ${command}`).toBe(401);
    }
    await learner.close();
    await visitor.close();

    expect(await getE2EItemRows(ids)).toEqual(before);
  });

  test("a cross-site page cannot act as a signed-in Admin; only JSON, never in the query string, never large", async ({
    page,
    baseURL,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("one"), status: "published" },
    ]);
    const before = await getE2EItemRows(ids);
    const body = {
      languageId,
      itemIds: ids,
      idempotencyKey: crypto.randomUUID(),
    };
    await renewSession(page);

    const attempts: [string, Record<string, string>][] = [
      [
        "a cross-site fetch",
        {
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
          "content-type": "application/json",
        },
      ],
      [
        "a same-site sibling",
        { ...fromThisApp(originOf(baseURL)), "sec-fetch-site": "same-site" },
      ],
      ["no origin information at all", { "content-type": "application/json" }],
    ];
    for (const command of COMMANDS) {
      for (const [name, headers] of attempts) {
        const response = await page.request.post(`${API}/${command}`, {
          headers,
          data: JSON.stringify(body),
        });
        expect(response.status(), `${command}: ${name}`).toBe(403);
      }
      for (const type of [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
      ]) {
        const response = await page.request.post(`${API}/${command}`, {
          headers: fromThisApp(originOf(baseURL), type),
          data: JSON.stringify(body),
        });
        expect(response.status(), `${command}: ${type}`).toBe(415);
      }
      const inQuery = await page.request.post(
        `${API}/${command}?languageId=${languageId}`,
        { headers: fromThisApp(originOf(baseURL)), data: JSON.stringify(body) },
      );
      expect(inQuery.status(), `${command}: query string`).toBe(422);
      const big = await page.request.post(`${API}/${command}`, {
        headers: fromThisApp(originOf(baseURL)),
        data: JSON.stringify({ ...body, padding: "x".repeat(9_000) }),
      });
      expect(big.status(), `${command}: oversized`).toBe(413);
    }
    expect(await getE2EItemRows(ids)).toEqual(before);
  });

  test("a body that is not exactly the command is refused — the bound, a name twice, an actor, a target the move does not have", async ({
    page,
    baseURL,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("one"), status: "published" },
    ]);
    const before = await getE2EItemRows(ids);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const base = { languageId, itemIds: ids };
    const key = () => crypto.randomUUID();
    const randomIds = (count: number) =>
      Array.from({ length: count }, () => crypto.randomUUID());

    const bodies: [string, Command, unknown][] = [
      ["invalid JSON", "bulk-archive", "{not json"],
      ["an empty body", "bulk-archive", ""],
      ["a list", "bulk-archive", [base]],
      ["no items", "bulk-archive", { languageId, idempotencyKey: key() }],
      [
        "an empty list of items",
        "bulk-archive",
        { ...base, itemIds: [], idempotencyKey: key() },
      ],
      [
        "101 items",
        "bulk-archive",
        { ...base, itemIds: randomIds(101), idempotencyKey: key() },
      ],
      [
        "an item named twice",
        "bulk-archive",
        { ...base, itemIds: [ids[0], ids[0]], idempotencyKey: key() },
      ],
      [
        "an item named twice in another letter case",
        "bulk-archive",
        {
          ...base,
          itemIds: [ids[0], ids[0]!.toUpperCase()],
          idempotencyKey: key(),
        },
      ],
      [
        "an item that is not an id",
        "bulk-archive",
        { ...base, itemIds: ["x"], idempotencyKey: key() },
      ],
      ["no language", "bulk-archive", { itemIds: ids, idempotencyKey: key() }],
      ["no key", "bulk-archive", base],
      [
        "a key that is not a UUID",
        "bulk-archive",
        { ...base, idempotencyKey: "retry-1" },
      ],
      [
        "an actor",
        "bulk-archive",
        { ...base, idempotencyKey: key(), actorUserId: "someone" },
      ],
      [
        "a role",
        "bulk-publish",
        { ...base, idempotencyKey: key(), role: "admin" },
      ],
      [
        "a status",
        "bulk-publish",
        { ...base, idempotencyKey: key(), status: "published" },
      ],
      [
        "the old field name for items",
        "bulk-archive",
        { languageId, learningItemIds: ids, idempotencyKey: key() },
      ],
      [
        "a move that names no target",
        "bulk-move",
        { ...base, idempotencyKey: key() },
      ],
      [
        "a move with the old group name",
        "bulk-move",
        { ...base, vocabularyGroupId: w.ga.id, idempotencyKey: key() },
      ],
      [
        "a move to a level that is not an id",
        "bulk-move",
        { ...base, levelId: "x", idempotencyKey: key() },
      ],
    ];
    for (const [name, command, data] of bodies) {
      const response = await page.request.post(`${API}/${command}`, {
        headers,
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
      expect(response.status(), name).toBe(422);
    }
    expect(await getE2EItemRows(ids)).toEqual(before);

    // The bound is inclusive: exactly 100 names pass validation and reach the
    // service, which says none of them exists.
    await spendRateBudget("admin-mutation");
    const exactly = await page.request.post(`${API}/bulk-archive`, {
      headers,
      data: JSON.stringify({
        ...base,
        itemIds: randomIds(100),
        idempotencyKey: key(),
      }),
    });
    expect(exactly.status()).toBe(404);
    expect((await exactly.json()).error.code).toBe("NOT_FOUND");
  });

  test("refuse another language's items, and another language's level or group — in the Admin's own words — and change nothing", async ({
    page,
    baseURL,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("one"), status: "pending" },
      { term: t("two"), status: "published" },
    ]);
    const other = await seedOtherLanguage(t("other"));
    try {
      const before = await getE2EItemRows([...ids, other.itemId]);
      await renewSession(page);
      const headers = fromThisApp(originOf(baseURL));
      const key = () => crypto.randomUUID();
      const post = (command: Command, data: unknown) =>
        page.request.post(`${API}/${command}`, {
          headers,
          data: JSON.stringify(data),
        });
      const refusedAs422 = async (
        name: string,
        command: Command,
        data: unknown,
        message: string,
      ) => {
        const response = await post(command, data);
        expect(response.status(), name).toBe(422);
        expect((await response.json()).error.message, name).toContain(message);
      };

      await spendRateBudget("admin-mutation", 4);
      await spendRateBudget("admin-publish");
      const mixed = "aren't in this language";
      await refusedAs422(
        "archive across languages",
        "bulk-archive",
        {
          languageId,
          itemIds: [ids[0], other.itemId],
          idempotencyKey: key(),
        },
        mixed,
      );
      await refusedAs422(
        "publish across languages",
        "bulk-publish",
        {
          languageId,
          itemIds: [ids[0], other.itemId],
          idempotencyKey: key(),
        },
        mixed,
      );
      await refusedAs422(
        "move across languages",
        "bulk-move",
        {
          languageId,
          itemIds: [ids[0], other.itemId],
          levelId: w.b.id,
          idempotencyKey: key(),
        },
        mixed,
      );
      await refusedAs422(
        "the other language named, our items",
        "bulk-archive",
        {
          languageId: other.languageId,
          itemIds: ids,
          idempotencyKey: key(),
        },
        mixed,
      );
      await refusedAs422(
        "a level of another language",
        "bulk-move",
        {
          languageId,
          itemIds: ids,
          levelId: other.levelId,
          idempotencyKey: key(),
        },
        "That level doesn't belong to the selected language.",
      );
      await refusedAs422(
        "a group of another language",
        "bulk-move",
        {
          languageId,
          itemIds: ids,
          groupId: other.groupId,
          idempotencyKey: key(),
        },
        "That group doesn't belong to the selected language.",
      );

      // An item that does not exist is a 404 in its own words.
      const missing = await post("bulk-archive", {
        languageId,
        itemIds: [ids[0], crypto.randomUUID()],
        idempotencyKey: key(),
      });
      expect(missing.status()).toBe(404);
      expect((await missing.json()).error.message).toContain(
        "no longer exists",
      );

      expect(await getE2EItemRows([...ids, other.itemId])).toEqual(before);
    } finally {
      await other.remove();
    }
  });

  test("answer a repeated command from what they stored, refuse a reused key with different data, and are never cached", async ({
    page,
    baseURL,
  }) => {
    const w = await world();
    const [one, two] = await items(w.a, w.ga, [
      { term: t("one"), status: "published" },
      { term: t("two"), status: "published" },
    ]);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const key = crypto.randomUUID();
    const body = { languageId, itemIds: [one], idempotencyKey: key };

    await spendRateBudget("admin-mutation", 3);
    const first = await page.request.post(`${API}/bulk-archive`, {
      headers,
      data: JSON.stringify(body),
    });
    expect(first.status()).toBe(200);
    expect(first.headers()["cache-control"]).toContain("no-store");
    const answer = await first.json();
    expect(answer).toEqual({
      data: { archivedItemIds: [one], alreadyArchivedItemIds: [] },
    });

    // The same command again: the same answer, not "already archived".
    const again = await page.request.post(`${API}/bulk-archive`, {
      headers,
      data: JSON.stringify(body),
    });
    expect(again.status()).toBe(200);
    expect(await again.json()).toEqual(answer);
    expect(await countE2EItemAudits("CURRICULUM_ITEM_ARCHIVED", one!)).toBe(1);

    // The same key for different data is refused, and the other item is untouched.
    const reused = await page.request.post(`${API}/bulk-archive`, {
      headers,
      data: JSON.stringify({ ...body, itemIds: [two] }),
    });
    expect(reused.status()).toBe(409);
    const [untouched] = await getE2EItemRows([two!]);
    expect(untouched!.status).toBe("published");

    // A refusal is never cached either.
    expect(reused.headers()["cache-control"]).toContain("no-store");
  });
});

/* -------------------------------------------------------------------------- */
/* The specialist ordering tools                                              */
/* -------------------------------------------------------------------------- */

test.describe("ordering stays with the specialist tools", () => {
  test("the reorder tool ignores the browse filters, saves a complete order, and keeps position and lesson priority one order", async ({
    page,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("v1"), status: "published" },
      { term: t("v2"), status: "pending" },
      { term: t("v3"), status: "archived" },
      { term: t("v4"), status: "published", lessonPriority: 90 },
    ]);
    const [v1, v2, v3, v4] = ids;

    // A browse filter (archived only) is in the address; the tool shows everything.
    await page.goto(
      `${PAGE}?language=${languageId}&level=${w.a.id}&type=vocabulary&status=archived&mode=reorder`,
    );
    await expect(
      page.getByRole("button", { name: `Move ${t("v4")} up` }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Reordering always shows every item in this level and type. Your search and filters apply again when you go back to browsing.",
      ),
    ).toBeVisible();
    for (const term of ["v1", "v2", "v3", "v4"]) {
      await expect(
        page.getByRole("button", { name: `Move ${t(term)} down` }),
      ).toBeVisible();
    }
    await shot(page, "bulk-reorder-tool-light");

    await page.getByRole("button", { name: `Move ${t("v4")} up` }).click();
    await page.getByRole("button", { name: `Move ${t("v4")} up` }).click();
    await spendRateBudget("admin-mutation");
    await page.getByRole("button", { name: "Save order" }).click();

    await expect
      .poll(async () =>
        (await getE2ELevelOrder(w.a.id, "vocabulary")).map((row) => row.id),
      )
      .toEqual([v1, v4, v2, v3]);
    const order = await getE2ELevelOrder(w.a.id, "vocabulary");
    expect(order.map((row) => row.position)).toEqual([1, 2, 3, 4]);
    // The one order lessons are taught in.
    expect(order.map((row) => row.lessonPriority)).toEqual([1, 2, 3, 4]);
    // One reorder, recorded against the level it arranged.
    expect(await countE2EItemAudits("CURRICULUM_ITEM_REORDERED", w.a.id)).toBe(
      1,
    );

    // Back to browsing keeps the filter that was in the address.
    await page.getByRole("link", { name: "← Back to browsing" }).click();
    await expect(page).toHaveURL(/status=archived/);
    await expect(page).not.toHaveURL(/mode=reorder/);
  });

  test("an order saved from a view that no longer matches the level is refused whole — nothing is reordered", async ({
    page,
  }) => {
    const w = await world();
    const ids = await items(w.a, w.ga, [
      { term: t("v1"), status: "published" },
      { term: t("v2"), status: "published" },
      { term: t("v3"), status: "published" },
    ]);
    const before = await getE2ELevelOrder(w.a.id, "vocabulary");

    await page.goto(
      `${PAGE}?language=${languageId}&level=${w.a.id}&type=vocabulary&mode=reorder`,
    );
    await expect(
      page.getByRole("button", { name: `Move ${t("v1")} down` }),
    ).toBeVisible();

    // Another item joins the level while this page is open.
    const [late] = await items(w.a, w.ga, [
      { term: t("late"), status: "published" },
    ]);

    await page.getByRole("button", { name: `Move ${t("v1")} down` }).click();
    await spendRateBudget("admin-mutation");
    await page.getByRole("button", { name: "Save order" }).click();

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "changed while you were arranging" }),
    ).toBeVisible();
    // Exactly as it was — plus the one that arrived, in the place it arrived.
    const after = await getE2ELevelOrder(w.a.id, "vocabulary");
    expect(after.map((row) => row.id)).toEqual([...ids, late]);
    expect(after.slice(0, 3)).toEqual(before);
    expect(await countE2EItemAudits("CURRICULUM_ITEM_REORDERED", w.a.id)).toBe(
      0,
    );
  });

  test("a level and type with more items than the tool can arrange is told so, instead of being offered a list that could never be saved", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const w = await world();
    await items(
      w.a,
      w.ga,
      Array.from({ length: 101 }, (_, index) => ({
        term: t(`m${String(index + 1).padStart(3, "0")}`),
      })),
    );

    await page.goto(
      `${PAGE}?language=${languageId}&level=${w.a.id}&type=vocabulary&mode=reorder`,
    );
    await expect(
      page.getByText(
        "This level has more than 100 vocabulary items, which is more than the order tool can arrange at once.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save order" })).toHaveCount(
      0,
    );
    await shot(page, "bulk-reorder-over-bound-light");

    // The level's own page says the same, and its board will not save either.
    await page.goto(`${PAGE}/levels/${w.a.id}`);
    await expect(
      page.getByText(
        "This level has more than 100 vocabulary items, which is more than the order tool can arrange at once.",
      ),
    ).toBeVisible();
  });

  test("a level within the bound is arranged from its own page, with every item in the level's order", async ({
    page,
  }) => {
    const w = await world();
    await items(w.a, w.ga, [
      { term: t("w1"), status: "published" },
      { term: t("g1"), type: "grammar", status: "published" },
      { term: t("w2"), status: "archived" },
    ]);

    await page.goto(`${PAGE}/levels/${w.a.id}`);

    // Both types are complete lists — the archived item included, since the
    // order it sits in is part of the same order.
    await expect(
      page.getByRole("heading", { name: "Vocabulary (2)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Grammar (1)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: t("w2"), exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Move ${t("w1")} later` }),
    ).toBeEnabled();
    await expect(
      page.getByText("which is more than the order tool can arrange at once"),
    ).toHaveCount(0);
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
    await items(w.a, w.ga, [
      { term: t("one"), status: "pending" },
      { term: t("two"), status: "published" },
    ]);
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await tick(page, t("one"), t("two"));
    await shot(page, "bulk-bar-mixed-dark");

    const { border, expectedBorder } = await page.evaluate(() => {
      const bar = document.querySelector(
        '[role="group"][aria-label="Actions for the selected items"]',
      ) as HTMLElement;
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      probe.style.borderBottom = "1px solid var(--border-default)";
      const result = {
        border: getComputedStyle(bar).borderBottomColor,
        expectedBorder: getComputedStyle(probe).borderBottomColor,
      };
      probe.remove();
      return result;
    });
    expect(border).toBe(expectedBorder);

    await action(page, "Archive").click();
    await expect(dialog(page, "Archive 2 items?")).toBeVisible();
    await shot(page, "bulk-archive-dialog-dark");
  });

  test("fits a 390 px screen: the bar wraps, the dialogs fit, nothing scrolls sideways", async ({
    page,
  }) => {
    const w = await world();
    await items(w.a, w.ga, [
      { term: t("one"), status: "pending" },
      { term: t("two"), status: "published" },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const noSidewaysScroll = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      );
    expect(await noSidewaysScroll()).toBe(true);

    await tick(page, t("one"), t("two"));
    expect(await noSidewaysScroll()).toBe(true);
    // Every action is reachable: wrapped, not clipped.
    for (const name of [
      "Publish",
      "Move to level",
      "Move to group",
      "Archive",
    ]) {
      const box = await action(page, name).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await shot(page, "bulk-bar-mixed-390");

    await action(page, "Move to level").click();
    const confirm = dialog(page, "Move 2 items to a level");
    await confirm.getByRole("combobox", { name: "Target level" }).click();
    await page
      .getByRole("option", { name: `Level ${w.b.levelNumber}`, exact: true })
      .click();
    await expect(confirm).toContainText("will move to");
    expect(await noSidewaysScroll()).toBe(true);
    const frame = await confirm.boundingBox();
    expect(frame!.x).toBeGreaterThanOrEqual(0);
    expect(frame!.x + frame!.width).toBeLessThanOrEqual(390);
    await shot(page, "bulk-move-level-dialog-390");
  });
});
