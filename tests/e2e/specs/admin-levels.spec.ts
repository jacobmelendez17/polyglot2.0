import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

import type { AdminLevelList } from "@/domains/admin";

import {
  countE2ELevelAudits,
  findE2ELevelByNumber,
  getE2EAdminScope,
  getE2ELevel,
  getE2ELevelCounts,
  getE2ELevels,
  removeSeededLevels,
  seedEmptyLanguage,
  seedLevel,
  seedManyLevels,
  seedOtherLanguage,
  setE2EAdminRole,
  type E2ELevel,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";
import { ensureLearnerOnboarded } from "../support/e2e-state";
import { spendRateBudget } from "../support/rate-budget";

/**
 * Spec 26 Unit 4 — the Levels index and a level's metadata form, rendered
 * through React Admin, against the real signed-in app and the isolated E2E
 * database. The specialist `LevelItemBoard` on a level's page is unchanged and
 * only checked to still be there.
 *
 * Every level this file needs is created through the real `createLevel` /
 * `updateLevel` services (see `support/e2e-admin.ts`) or through the UI under
 * test, numbered well away from anything seeded, and removed after each test.
 * Roles other than admin flip the permanent E2E admin identity's *database*
 * role and restore it after every test.
 *
 * Setting a level's status to `published` is rate limited as a publication
 * (10 / 60s) and every other write as a mutation (30 / 60s) — real controls,
 * never relaxed. The spec spends from them through the shared account in
 * `support/rate-budget.ts` and waits out the window rather than tripping it.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const LEVELS_API = "/api/v1/admin/levels";
const LIST_MAX = 100;

const RUN = crypto.randomUUID().slice(0, 6);

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial" });

let languageId = "";
/** Levels created by the running test — by the fixtures, or by the UI under test. Removed after it. */
let created: string[] = [];

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  await removeSeededLevels(created);
  created = [];
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function level(
  options: Parameters<typeof seedLevel>[0] = {},
): Promise<E2ELevel> {
  const made = await seedLevel(options);
  created.push(made.id);
  return made;
}

/** A level number nothing uses, for a test that creates one through the UI. */
async function unusedNumber(from = 600): Promise<number> {
  for (let candidate = from; candidate < from + 150; candidate++) {
    if (!(await findE2ELevelByNumber(candidate))) return candidate;
  }
  throw new Error("No unused level number.");
}

/** Finds a level the UI just created, and queues it for removal. */
async function adopt(levelNumber: number): Promise<E2ELevel> {
  const found = await findE2ELevelByNumber(levelNumber);
  expect(found, `level ${levelNumber} should exist`).not.toBeNull();
  created.push(found!.id);
  return found!;
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // A dialog fades in; a picture taken mid-fade shows nothing useful.
  const container = page.locator(".MuiDialog-container");
  if ((await container.count()) > 0)
    await expect(container).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const table = (page: Page) => page.getByRole("table", { name: "Levels" });
const label = (l: Pick<E2ELevel, "levelNumber" | "name">) =>
  `Level ${l.levelNumber}${l.name ? ` — ${l.name}` : ""}`;
const linkOf = (page: Page, l: Pick<E2ELevel, "levelNumber" | "name">) =>
  table(page).getByRole("link", { name: label(l), exact: true });
// `has` is evaluated inside each row, so its locator must start at the page —
// one chained from the table would look for a table inside a row.
const rowOf = (page: Page, l: Pick<E2ELevel, "levelNumber" | "name">) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: label(l), exact: true }) });

async function listReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Levels", exact: true }),
  ).toBeVisible();
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function openList(page: Page, search = ""): Promise<void> {
  await page.goto(`/admin/curriculum/levels?language=${languageId}${search}`);
  await listReady(page);
}

const detailUrl = (id: string) => `/admin/curriculum/levels/${id}`;

async function openDetail(page: Page, l: E2ELevel): Promise<void> {
  await page.goto(detailUrl(l.id));
  await expect(
    page.getByRole("heading", { name: label(l), level: 1 }),
  ).toBeVisible();
  // The form (or, for a writer, its read-only view) has loaded. Not "no status
  // region": the form keeps an empty one of its own, for announcing "Saved".
  await expect(
    page.getByRole("status").filter({ hasText: "Loading" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Name")
      .or(page.getByText("An Admin edits level properties.")),
  ).toBeVisible();
}

// Exact: the board below has a "Save order" button of its own while dirty.
const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Save", exact: true });

async function choose(page: Page, field: RegExp, option: string) {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** The headers a real page from this app attaches to a same-origin `fetch`. */
const fromThisApp = (origin: string, contentType = "application/json") => ({
  origin,
  "sec-fetch-site": "same-origin",
  "content-type": contentType,
});
const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin;

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

/** The body of the request an action is about to make, captured as it is sent. */
function captureRequest(
  page: Page,
  method: "POST" | "PATCH",
): Promise<Request> {
  return page.waitForRequest(
    (request) =>
      request.method() === method && request.url().includes(LEVELS_API),
  );
}

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("the list", () => {
  test("shows every level with what it holds, matching the database", async ({
    page,
  }) => {
    const named = await level({
      name: `E2E ${RUN} list`,
      status: "pending",
      cefrLevel: "B1",
    });
    const empty = await level();

    await openList(page);
    const headers = await table(page).getByRole("columnheader").allInnerTexts();
    expect(headers).toEqual([
      "Level",
      "Status",
      "CEFR band",
      "Vocabulary",
      "Grammar",
      "Groups",
    ]);

    // Every level the database has, in number order, with its own counts.
    const everything = await getE2ELevels();
    expect(everything.length).toBeGreaterThanOrEqual(3);
    await expect(table(page).getByRole("link")).toHaveText(
      everything.map(label),
    );
    for (const l of everything) {
      const counts = await getE2ELevelCounts(l.id);
      const cells = rowOf(page, l).getByRole("cell");
      await expect(cells.nth(1)).toContainText(
        l.status.charAt(0).toUpperCase() + l.status.slice(1),
      );
      await expect(cells.nth(2)).toHaveText(l.cefrLevel ?? "—");
      await expect(cells.nth(3)).toHaveText(String(counts.vocabularyItems));
      await expect(cells.nth(4)).toHaveText(String(counts.grammarItems));
      await expect(cells.nth(5)).toHaveText(String(counts.vocabularyGroups));
    }

    // A level that holds nothing is zeros — not an error, and not hidden.
    await expect(rowOf(page, empty).getByRole("cell").nth(3)).toHaveText("0");
    await expect(rowOf(page, named).getByRole("cell").nth(2)).toHaveText("B1");
    await noHash(page);
    await shot(page, "levels-list-light");
  });

  test("links each level to its own page, where the specialist board stays", async ({
    page,
  }) => {
    const [seeded] = await getE2ELevels();
    const mine = await level({ name: `E2E ${RUN} board` });
    await openList(page);

    await expect(linkOf(page, mine)).toHaveAttribute(
      "href",
      detailUrl(mine.id),
    );
    await linkOf(page, mine).click();

    await expect(page).toHaveURL(new RegExp(`${detailUrl(mine.id)}$`));
    await expect(
      page.getByRole("heading", { name: label(mine), level: 1 }),
    ).toBeVisible();
    // The board is the unchanged, server-rendered component beneath the form.
    await expect(
      page.getByRole("heading", { name: /^Vocabulary \(0\)/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Grammar \(0\)/ }),
    ).toBeVisible();

    // And on a level that holds things, the board's own counts are the list's.
    const counts = await getE2ELevelCounts(seeded!.id);
    await page.goto(detailUrl(seeded!.id));
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`^Vocabulary \\(${counts.vocabularyItems}\\)`),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`^Grammar \\(${counts.grammarItems}\\)`),
      }),
    ).toBeVisible();
  });

  test("the whole row is a click target, and the link works from the keyboard", async ({
    page,
  }) => {
    const mine = await level();
    await openList(page);

    // A cell that is not the link. The link's overlay covers it by design, so
    // Playwright's "is anything intercepting?" check would refuse; `force`
    // skips that check but still performs a real mouse click, which the
    // browser hit-tests to the overlay and follows.
    await rowOf(page, mine).getByRole("cell").nth(1).click({ force: true });
    await expect(page).toHaveURL(new RegExp(`${detailUrl(mine.id)}$`));

    await openList(page);
    await linkOf(page, mine).focus();
    await expect(linkOf(page, mine)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${detailUrl(mine.id)}$`));
  });

  test("never mixes languages, and switching starts from that language's own levels", async ({
    page,
  }) => {
    const mine = await level({ name: `E2E ${RUN} mixed` });
    const other = await seedOtherLanguage(`zz${RUN}`);
    try {
      // The API: another language's levels hold none of this language's.
      await renewSession(page);
      const response = await page.request.get(
        `${LEVELS_API}?language=${other.languageId}`,
      );
      expect(response.status()).toBe(200);
      const theirs = (await response.json()).data as AdminLevelList;
      expect(theirs.items.map((item) => item.id)).not.toContain(mine.id);
      expect(theirs.items.map((item) => item.id)).toContain(other.levelId);

      // The screen: two languages now, so the switch appears.
      await openList(page);
      await page.getByRole("combobox", { name: /Language/ }).click();
      await page.getByRole("option").filter({ hasText: "E2E Other" }).click();
      await expect(page).toHaveURL(new RegExp(`language=${other.languageId}`));
      await expect(
        table(page).getByRole("link", { name: "Level 1 — Other level" }),
      ).toBeVisible();
      await expect(linkOf(page, mine)).toHaveCount(0);

      await page.getByRole("combobox", { name: /Language/ }).click();
      await page
        .getByRole("option")
        .filter({ hasNotText: "E2E Other" })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`language=${languageId}`));
      await expect(linkOf(page, mine)).toBeVisible();
      await noHash(page);
    } finally {
      await other.remove();
    }
  });

  test("invites an Admin to add the first level of a language that has none", async ({
    page,
  }) => {
    const empty = await seedEmptyLanguage();
    try {
      await page.goto(`/admin/curriculum/levels?language=${empty.languageId}`);
      await expect(
        page.getByText("No levels yet for this language"),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Add the first level, then build out its curriculum from the Curriculum page.",
        ),
      ).toBeVisible();
      await expect(table(page).getByRole("row")).toHaveCount(0);
      await shot(page, "levels-list-empty");
    } finally {
      await empty.remove();
    }
  });

  test("falls back to the first language for an unknown one in the address", async ({
    page,
  }) => {
    const mine = await level();
    await page.goto("/admin/curriculum/levels?language=not-a-language");
    await listReady(page);
    await expect(linkOf(page, mine)).toBeVisible();
  });

  test("is bounded, and says so when there are more levels than it shows", async ({
    page,
  }) => {
    const extra = await seedManyLevels(LIST_MAX + 1, 2000);
    created.push(...extra);

    await renewSession(page);
    const response = await page.request.get(
      `${LEVELS_API}?language=${languageId}`,
    );
    const list = (await response.json()).data as AdminLevelList;
    expect(list.items).toHaveLength(LIST_MAX);
    expect(list.truncated).toBe(true);

    await openList(page);
    await expect(
      page.getByText(`Showing the first ${LIST_MAX} levels.`),
    ).toBeVisible();
    // The header row, then exactly the bound.
    await expect(table(page).getByRole("row")).toHaveCount(LIST_MAX + 1);
  });
});

/* -------------------------------------------------------------------------- */
/* Adding a level                                                             */
/* -------------------------------------------------------------------------- */

test.describe("adding a level", () => {
  async function openDialog(page: Page): Promise<Locator> {
    await page.getByRole("button", { name: "Add level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a level" });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  const submit = (dialog: Locator) =>
    dialog.getByRole("button", { name: /^(Add level|Adding…)$/ });

  test("adds a draft with nothing attached, once, and lands on its page", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const number = await unusedNumber();
    await openList(page);

    const dialog = await openDialog(page);
    await expect(dialog).toContainText(
      "New levels start as drafts until their curriculum is built out and published.",
    );
    await shot(page, "levels-add-dialog");
    await dialog.getByLabel(/Level number/).fill(String(number));
    await dialog.getByLabel("Name (optional)").fill(`  E2E ${RUN} added  `);
    await submit(dialog).click();

    // The level exists once the request lands; wait for it, then take it over.
    await expect.poll(() => findE2ELevelByNumber(number)).not.toBeNull();
    const added = await adopt(number);
    await expect(page).toHaveURL(new RegExp(`${detailUrl(added.id)}$`));
    expect(added).toMatchObject({
      levelNumber: number,
      name: `E2E ${RUN} added`,
      status: "draft",
      cefrLevel: null,
    });
    expect(await getE2ELevelCounts(added.id)).toEqual({
      vocabularyItems: 0,
      grammarItems: 0,
      vocabularyGroups: 0,
    });
    expect(await countE2ELevelAudits("LEVEL_CREATED", added.id)).toBe(1);
    await expect(
      page.getByRole("heading", { name: label(added), level: 1 }),
    ).toBeVisible();
  });

  test("explains a number the language already has, adds nothing, and lets it be fixed", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation", 2);
    const taken = await level();
    const fresh = await unusedNumber(taken.levelNumber + 1);
    await openList(page);

    const dialog = await openDialog(page);
    await dialog.getByLabel(/Level number/).fill(String(taken.levelNumber));
    await dialog.getByLabel("Name (optional)").fill(`E2E ${RUN} dup`);
    await submit(dialog).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      `Level ${taken.levelNumber} already exists for this language.`,
    );
    // Still open, still filled in — nothing was lost by being refused.
    await expect(dialog.getByLabel("Name (optional)")).toHaveValue(
      `E2E ${RUN} dup`,
    );
    await shot(page, "levels-add-taken");
    const sameNumber = (await getE2ELevels()).filter(
      (l) => l.levelNumber === taken.levelNumber,
    );
    expect(sameNumber.map((l) => l.id)).toEqual([taken.id]);
    expect(await countE2ELevelAudits("LEVEL_CREATED", taken.id)).toBe(1);

    // Fix it and send again: a different request, so a different key.
    await dialog.getByLabel(/Level number/).fill(String(fresh));
    await submit(dialog).click();
    await expect(page).toHaveURL(/\/admin\/curriculum\/levels\/[0-9a-f-]{36}$/);
    const added = await adopt(fresh);
    expect(added.name).toBe(`E2E ${RUN} dup`);
  });

  test("explains what is wrong with the number, in the dialog, and sends nothing", async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes(LEVELS_API))
        posts.push(request.url());
    });
    await openList(page);
    const dialog = await openDialog(page);
    const number = dialog.getByLabel(/Level number/);

    await number.fill("0");
    await submit(dialog).click();
    await expect(dialog.getByText("Must be at least 1")).toBeVisible();

    await number.fill("1.5");
    await submit(dialog).click();
    await expect(dialog.getByText("Enter a whole number")).toBeVisible();

    await number.fill("");
    await dialog
      .getByLabel("Name (optional)")
      .fill("a name alone is not enough");
    await submit(dialog).click();
    await expect(dialog.getByText("Required")).toBeVisible();

    expect(posts).toEqual([]);
  });

  test("changes nothing when cancelled, and a reopened dialog starts empty", async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes(LEVELS_API))
        posts.push(request.url());
    });
    await openList(page);
    let dialog = await openDialog(page);
    await dialog.getByLabel(/Level number/).fill("777");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    dialog = await openDialog(page);
    await expect(dialog.getByLabel(/Level number/)).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(posts).toEqual([]);
    expect(await findE2ELevelByNumber(777)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Editing a level's properties                                               */
/* -------------------------------------------------------------------------- */

test.describe("editing a level's properties", () => {
  test("changes the name and band, sends only those, and updates the page's own heading", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const before = await level({ name: `E2E ${RUN} before` });
    await openDetail(page, before);

    await expect(page.getByLabel("Name")).toHaveValue(before.name!);
    await expect(saveButton(page)).toBeDisabled();
    await shot(page, "levels-edit-form");

    await page.getByLabel("Name").fill(`E2E ${RUN} after`);
    await choose(page, /CEFR band/, "C1");
    await expect(saveButton(page)).toBeEnabled();
    const sent = captureRequest(page, "PATCH");
    await saveButton(page).click();

    const body = JSON.parse((await sent).postData()!);
    // Only what changed — not the status, which someone else may have changed.
    expect(Object.keys(body)).toEqual(["name", "cefrLevel", "idempotencyKey"]);
    expect(body).toMatchObject({ name: `E2E ${RUN} after`, cefrLevel: "C1" });

    await expect(page.getByText("Saved")).toBeVisible();
    // The heading is rendered by the server; the form asked it to re-render.
    await expect(
      page.getByRole("heading", {
        name: `Level ${before.levelNumber} — E2E ${RUN} after`,
        level: 1,
      }),
    ).toBeVisible();
    await expect(saveButton(page)).toBeDisabled();

    expect(await getE2ELevel(before.id)).toMatchObject({
      name: `E2E ${RUN} after`,
      cefrLevel: "C1",
      status: "draft",
    });
    expect(await countE2ELevelAudits("LEVEL_UPDATED", before.id)).toBe(1);
  });

  test("clears the name and the band with a blank name and 'Not set'", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const before = await level({
      name: `E2E ${RUN} clear`,
      cefrLevel: "B2",
    });
    await openDetail(page, before);

    await page.getByLabel("Name").fill("   ");
    // The empty option reads "Not set"; React Admin names it "Clear value".
    await choose(page, /CEFR band/, "Clear value");
    await saveButton(page).click();

    await expect(page.getByText("Saved")).toBeVisible();
    expect(await getE2ELevel(before.id)).toMatchObject({
      name: null,
      cefrLevel: null,
    });
    await expect(
      page.getByRole("heading", {
        name: `Level ${before.levelNumber}`,
        level: 1,
        exact: true,
      }),
    ).toBeVisible();
  });

  test("saves a status change learners cannot see without asking", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const before = await level();
    await openDetail(page, before);

    await choose(page, /Status/, "Pending");
    await saveButton(page).click();

    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await getE2ELevel(before.id))?.status).toBe("pending");
  });

  test("asks before publishing an empty level — and then publishes it, because that is the Admin's call", async ({
    page,
  }) => {
    await spendRateBudget("admin-publish");
    const before = await level({ name: `E2E ${RUN} empty` });
    await openDetail(page, before);
    expect(await getE2ELevelCounts(before.id)).toEqual({
      vocabularyItems: 0,
      grammarItems: 0,
      vocabularyGroups: 0,
    });

    await choose(page, /Status/, "Published");
    await saveButton(page).click();

    const dialog = page.getByRole("dialog", {
      name: `Publish Level ${before.levelNumber}?`,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Learners will be able to use this level",
    );
    await expect(dialog).toContainText("Status: Draft → Published");
    await shot(page, "levels-status-dialog");
    // Opening the dialog changed nothing.
    expect((await getE2ELevel(before.id))?.status).toBe("draft");

    await dialog.getByRole("button", { name: "Publish level" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Saved")).toBeVisible();

    // No 48 / 4 / 12 gate: an empty level went live.
    expect((await getE2ELevel(before.id))?.status).toBe("published");
    expect(await countE2ELevelAudits("LEVEL_UPDATED", before.id)).toBe(1);
  });

  test("Cancel on that question changes nothing", async ({ page }) => {
    const before = await level();
    await openDetail(page, before);
    await choose(page, /Status/, "Published");
    await saveButton(page).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toHaveCount(0);
    expect((await getE2ELevel(before.id))?.status).toBe("draft");
    expect(await countE2ELevelAudits("LEVEL_UPDATED", before.id)).toBe(0);
    // The choice is still there to reconsider.
    await expect(page.getByRole("combobox", { name: /Status/ })).toHaveText(
      "Published",
    );
  });

  test("what learners can reach follows the level's status — the question's own words are true", async ({
    page,
    browser,
  }) => {
    await spendRateBudget("admin-publish");
    await spendRateBudget("admin-mutation");
    await ensureLearnerOnboarded();
    // Inside the learner-facing range (1–50), so a learner can open its page.
    const mine = await level({
      from: 30,
      to: 49,
      name: `E2E ${RUN} visible`,
    });
    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    const learnersName = learnerPage.getByText(`E2E ${RUN} visible`);
    try {
      const levelPage = `/levels/${mine.levelNumber}`;
      await learnerPage.goto(levelPage);
      await expect(
        learnerPage.getByRole("heading", {
          name: `Level ${mine.levelNumber}`,
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
      // A draft level's own name is not shown to learners.
      await expect(learnersName).toHaveCount(0);

      await openDetail(page, mine);
      await choose(page, /Status/, "Published");
      await saveButton(page).click();
      await page.getByRole("button", { name: "Publish level" }).click();
      await expect(page.getByText("Saved")).toBeVisible();

      await learnerPage.reload();
      await expect(learnersName.first()).toBeVisible();

      // And taking it off-line says what it will do, and does it.
      await choose(page, /Status/, "Archived");
      await saveButton(page).click();
      const dialog = page.getByRole("dialog", {
        name: `Hide Level ${mine.levelNumber} from learners?`,
      });
      await expect(dialog).toContainText("Their progress is kept");
      await dialog.getByRole("button", { name: "Hide level" }).click();
      await expect(page.getByText("Saved")).toBeVisible();

      await learnerPage.reload();
      await expect(learnersName).toHaveCount(0);
      expect((await getE2ELevel(mine.id))?.status).toBe("archived");
    } finally {
      await learner.close();
    }
  });

  test("is operable by keyboard alone", async ({ page }) => {
    await spendRateBudget("admin-mutation");
    const before = await level({ name: `E2E ${RUN} keys` });
    await openDetail(page, before);

    await page.getByLabel("Name").focus();
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    await saveButton(page).focus();
    await expect(saveButton(page)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Saved")).toBeVisible();
    expect((await getE2ELevel(before.id))?.name).toBe(`E2E ${RUN} keys!`);
  });
});

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("roles", () => {
  test("a writer sees every level and its properties, with no way to add or change one — and is refused if they try", async ({
    page,
    baseURL,
  }) => {
    const mine = await level({ name: `E2E ${RUN} writer`, cefrLevel: "A2" });
    // Seeding the band went through the real `updateLevel`, which audits it:
    // what matters below is that the writer's attempts add nothing to this.
    const auditedBefore = await countE2ELevelAudits("LEVEL_UPDATED", mine.id);
    await setE2EAdminRole("writer");

    await openList(page);
    await expect(linkOf(page, mine)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add level" })).toHaveCount(
      0,
    );
    await expect(
      page.getByText("You can see every level. An Admin adds and edits them."),
    ).toBeVisible();
    await shot(page, "levels-list-writer");

    await linkOf(page, mine).click();
    await expect(
      page.getByRole("heading", { name: label(mine), level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("An Admin edits level properties."),
    ).toBeVisible();
    await expect(page.getByText("A2", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(saveButton(page)).toHaveCount(0);
    await shot(page, "levels-edit-writer");

    // Reading is allowed; the commands are not — whatever the page drew.
    const headers = fromThisApp(originOf(baseURL));
    expect(
      (await page.request.get(`${LEVELS_API}?language=${languageId}`)).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(LEVELS_API, {
          headers,
          data: {
            languageId,
            levelNumber: 880,
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${LEVELS_API}/${mine.id}`, {
          headers,
          data: { name: "Hijacked", idempotencyKey: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(403);
    expect(await findE2ELevelByNumber(880)).toBeNull();
    expect(await getE2ELevel(mine.id)).toMatchObject({
      name: `E2E ${RUN} writer`,
    });
    expect(await countE2ELevelAudits("LEVEL_UPDATED", mine.id)).toBe(
      auditedBefore,
    );
  });

  test("a developer is turned away from both pages and all three endpoints", async ({
    page,
    baseURL,
  }) => {
    const mine = await level();
    await setE2EAdminRole("developer");

    for (const path of [
      "/admin/curriculum/levels",
      detailUrl(mine.id),
    ] as const) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
    }
    await page.waitForFunction(() =>
      Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    );

    const headers = fromThisApp(originOf(baseURL));
    expect(
      (await page.request.get(`${LEVELS_API}?language=${languageId}`)).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(LEVELS_API, {
          headers,
          data: {
            languageId,
            levelNumber: 881,
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${LEVELS_API}/${mine.id}`, {
          headers,
          data: { name: "No", idempotencyKey: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(403);
    expect(await findE2ELevelByNumber(881)).toBeNull();
  });

  test("a role revoked while the Add dialog is open is refused by the server, and nothing is added", async ({
    page,
  }) => {
    const number = await unusedNumber(650);
    await openList(page);
    await page.getByRole("button", { name: "Add level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a level" });
    await dialog.getByLabel(/Level number/).fill(String(number));

    // The page still believes this person is an Admin; the database no longer does.
    await setE2EAdminRole("writer");
    await dialog.getByRole("button", { name: "Add level" }).click();

    await expect(dialog).toContainText(
      "You don't have access to this part of the admin console.",
    );
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^(Add level|Cancel)$/ }),
    ).toHaveCount(0);
    expect(await findE2ELevelByNumber(number)).toBeNull();
  });

  test("a role revoked while a level's form is open is refused on Save, and nothing changes", async ({
    page,
  }) => {
    const before = await level({ name: `E2E ${RUN} revoked` });
    await openDetail(page, before);
    await page.getByLabel("Name").fill("Changed behind their back");

    await setE2EAdminRole("writer");
    await saveButton(page).click();

    // Scoped by text: Next's own route announcer is a `role="alert"` too.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "You don't have access to this part" }),
    ).toBeVisible();
    expect((await getE2ELevel(before.id))?.name).toBe(`E2E ${RUN} revoked`);
    expect(await countE2ELevelAudits("LEVEL_UPDATED", before.id)).toBe(0);
  });

  test("a role revoked while the list is open takes the Add button away on refocus", async ({
    page,
  }) => {
    const mine = await level();
    await openList(page);
    await expect(page.getByRole("button", { name: "Add level" })).toBeVisible();

    await setE2EAdminRole("writer");
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    await expect(page.getByRole("button", { name: "Add level" })).toHaveCount(
      0,
    );
    // They can still read the levels.
    await expect(linkOf(page, mine)).toBeVisible();
  });

  test("a role revoked entirely replaces the list with access-denied", async ({
    page,
  }) => {
    await level();
    await openList(page);

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
  });
});

/* -------------------------------------------------------------------------- */
/* What the endpoints refuse                                                  */
/* -------------------------------------------------------------------------- */

test.describe("what the endpoints refuse", () => {
  let target: E2ELevel;
  let targetCreated: string[] = [];

  test.beforeAll(async () => {
    target = await seedLevel({ name: `E2E ${RUN} target` });
    targetCreated = [target.id];
  });
  test.afterAll(async () => {
    await removeSeededLevels(targetCreated);
  });

  const createBody = (levelNumber: number) => ({
    languageId,
    levelNumber,
    idempotencyKey: crypto.randomUUID(),
  });
  const patchBody = { name: "Nope", idempotencyKey: crypto.randomUUID() };
  const untouched = async () => {
    expect(await getE2ELevel(target.id)).toMatchObject({
      name: `E2E ${RUN} target`,
      status: "draft",
    });
    expect(await countE2ELevelAudits("LEVEL_UPDATED", target.id)).toBe(0);
  };

  test("a cross-site page cannot add or change a level as a signed-in Admin", async ({
    page,
    baseURL,
  }) => {
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
    for (const [name, headers] of attempts) {
      const create = await page.request.post(LEVELS_API, {
        headers,
        data: createBody(890),
      });
      expect(create.status(), `POST, ${name}`).toBe(403);
      const update = await page.request.patch(`${LEVELS_API}/${target.id}`, {
        headers,
        data: patchBody,
      });
      expect(update.status(), `PATCH, ${name}`).toBe(403);
    }
    expect(await findE2ELevelByNumber(890)).toBeNull();
    await untouched();
  });

  test("only JSON is accepted, never in the query string, and never large", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const response = await page.request.patch(`${LEVELS_API}/${target.id}`, {
        headers: fromThisApp(originOf(baseURL), type),
        data: JSON.stringify(patchBody),
      });
      expect(response.status(), type).toBe(415);
    }
    const inQuery = await page.request.patch(
      `${LEVELS_API}/${target.id}?name=Nope`,
      { headers, data: patchBody },
    );
    expect(inQuery.status()).toBe(422);
    const big = await page.request.patch(`${LEVELS_API}/${target.id}`, {
      headers,
      data: JSON.stringify({ ...patchBody, padding: "x".repeat(10_000) }),
    });
    expect(big.status()).toBe(413);
    await untouched();
  });

  test("malformed and over-eager bodies are refused with the rules the old action enforced", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const key = crypto.randomUUID();
    const creates: [string, unknown][] = [
      ["invalid JSON", "{not json"],
      ["level number zero", { ...createBody(1), levelNumber: 0 }],
      ["a negative level number", { ...createBody(1), levelNumber: -5 }],
      ["a fractional level number", { ...createBody(1), levelNumber: 2.5 }],
      ["a text level number", { ...createBody(1), levelNumber: "7" }],
      ["a name of only spaces", { ...createBody(891), name: "   " }],
      ["a status on create", { ...createBody(891), status: "published" }],
      ["an actor", { ...createBody(891), actorUserId: crypto.randomUUID() }],
      ["a non-UUID key", { ...createBody(891), idempotencyKey: "retry-1" }],
    ];
    for (const [name, data] of creates) {
      const response = await page.request.post(LEVELS_API, {
        headers,
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
      expect(response.status(), name).toBe(422);
    }
    const updates: [string, unknown][] = [
      ["nothing to change", { idempotencyKey: key }],
      ["an unknown status", { status: "live", idempotencyKey: key }],
      ["a cleared status", { status: null, idempotencyKey: key }],
      ["an unknown band", { cefrLevel: "A3", idempotencyKey: key }],
      ["an empty name", { name: "", idempotencyKey: key }],
      [
        "another level in the body",
        { name: "x", levelId: target.id, idempotencyKey: key },
      ],
      ["an actor", { name: "x", actorUserId: key, idempotencyKey: key }],
    ];
    for (const [name, data] of updates) {
      const response = await page.request.patch(`${LEVELS_API}/${target.id}`, {
        headers,
        data: JSON.stringify(data),
      });
      expect(response.status(), name).toBe(422);
    }
    expect(await findE2ELevelByNumber(891)).toBeNull();
    await untouched();
  });

  test("an unknown language, level, or path is a 404 or 422 — never a silent success or a fault", async ({
    page,
    baseURL,
  }) => {
    // The update of a level that is not there reaches the service (which is
    // where it is found missing), so it is counted against the limit.
    await spendRateBudget("admin-mutation");
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const stranger = crypto.randomUUID();

    expect(
      (await page.request.get(`${LEVELS_API}?language=${stranger}`)).status(),
    ).toBe(404);
    expect(
      (
        await page.request.post(LEVELS_API, {
          headers,
          data: { ...createBody(892), languageId: stranger },
        })
      ).status(),
    ).toBe(404);
    expect(await findE2ELevelByNumber(892)).toBeNull();

    // A level that is not there: refused, and no audit event for it.
    const missing = await page.request.patch(`${LEVELS_API}/${stranger}`, {
      headers,
      data: patchBody,
    });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.message).toBe(
      "That level could not be found.",
    );
    expect(await countE2ELevelAudits("LEVEL_UPDATED", stranger)).toBe(0);

    expect(
      (
        await page.request.patch(`${LEVELS_API}/not-an-id`, {
          headers,
          data: patchBody,
        })
      ).status(),
    ).toBe(422);

    // The list endpoint takes a language and nothing else.
    for (const query of [
      "",
      "language=lang-es",
      `language=${languageId}&sort=name`,
      `language=${languageId}&limit=5`,
      `language=${languageId}&cursor=x`,
    ]) {
      expect(
        (await page.request.get(`${LEVELS_API}?${query}`)).status(),
        query,
      ).toBe(422);
    }
  });

  test("each endpoint answers only its own methods", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    expect((await page.request.delete(LEVELS_API, { headers })).status()).toBe(
      405,
    );
    expect(
      (await page.request.patch(LEVELS_API, { headers, data: {} })).status(),
    ).toBe(405);
    expect(
      (await page.request.get(`${LEVELS_API}/${target.id}`)).status(),
    ).toBe(405);
    expect(
      (
        await page.request.post(`${LEVELS_API}/${target.id}`, {
          headers,
          data: patchBody,
        })
      ).status(),
    ).toBe(405);
    expect(
      (
        await page.request.delete(`${LEVELS_API}/${target.id}`, { headers })
      ).status(),
    ).toBe(405);
    await untouched();
    expect(await getE2ELevel(target.id)).not.toBeNull();
  });

  test("an anonymous caller gets 401 and a learner 403, from every endpoint", async ({
    browser,
    baseURL,
  }) => {
    const headers = fromThisApp(originOf(baseURL));
    const calls = (request: Page["request"]) => [
      () => request.get(`${LEVELS_API}?language=${languageId}`),
      () => request.post(LEVELS_API, { headers, data: createBody(893) }),
      () =>
        request.patch(`${LEVELS_API}/${target.id}`, {
          headers,
          data: patchBody,
        }),
    ];

    const visitor = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    for (const call of calls(visitor.request)) {
      expect((await call()).status()).toBe(401);
    }
    await visitor.close();

    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    await renewSession(learnerPage);
    for (const call of calls(learnerPage.request)) {
      expect((await call()).status()).toBe(403);
    }
    await learner.close();
    expect(await findE2ELevelByNumber(893)).toBeNull();
    await untouched();
  });

  test("privileged responses are never cached", async ({ page, baseURL }) => {
    await spendRateBudget("admin-mutation", 2);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const number = await unusedNumber(660);

    const read = await page.request.get(`${LEVELS_API}?language=${languageId}`);
    expect(read.headers()["cache-control"]).toContain("no-store");
    const made = await page.request.post(LEVELS_API, {
      headers,
      data: createBody(number),
    });
    expect(made.status()).toBe(200);
    expect(made.headers()["cache-control"]).toContain("no-store");
    const { levelId } = (await made.json()).data;
    created.push(levelId);
    const changed = await page.request.patch(`${LEVELS_API}/${levelId}`, {
      headers,
      data: { name: "x", idempotencyKey: crypto.randomUUID() },
    });
    expect(changed.status()).toBe(200);
    expect(changed.headers()["cache-control"]).toContain("no-store");
  });

  test("a replayed command is answered from the stored result; the same key for another request is refused", async ({
    page,
    baseURL,
  }) => {
    await spendRateBudget("admin-mutation", 6);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const number = await unusedNumber(670);
    const key = crypto.randomUUID();

    // Create: sent twice, as a retry after a lost response would send it.
    const first = await page.request.post(LEVELS_API, {
      headers,
      data: { languageId, levelNumber: number, idempotencyKey: key },
    });
    expect(first.status()).toBe(200);
    const { levelId } = (await first.json()).data;
    created.push(levelId);
    const replay = await page.request.post(LEVELS_API, {
      headers,
      data: { languageId, levelNumber: number, idempotencyKey: key },
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.levelId).toBe(levelId);
    expect(await countE2ELevelAudits("LEVEL_CREATED", levelId)).toBe(1);

    // The same key for a different number is a different request: refused.
    const reused = await page.request.post(LEVELS_API, {
      headers,
      data: { languageId, levelNumber: number + 1, idempotencyKey: key },
    });
    expect(reused.status()).toBe(409);
    expect(await findE2ELevelByNumber(number + 1)).toBeNull();

    // Update: the same, with PATCH.
    const updateKey = crypto.randomUUID();
    const body = { name: "Renamed once", idempotencyKey: updateKey };
    expect(
      (
        await page.request.patch(`${LEVELS_API}/${levelId}`, {
          headers,
          data: body,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch(`${LEVELS_API}/${levelId}`, {
          headers,
          data: body,
        })
      ).status(),
    ).toBe(200);
    expect(await countE2ELevelAudits("LEVEL_UPDATED", levelId)).toBe(1);
    expect(
      (
        await page.request.patch(`${LEVELS_API}/${levelId}`, {
          headers,
          data: { name: "Renamed twice", idempotencyKey: updateKey },
        })
      ).status(),
    ).toBe(409);
    expect((await getE2ELevel(levelId))?.name).toBe("Renamed once");
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables", async ({
    page,
  }) => {
    const mine = await level({ name: `E2E ${RUN} dark` });
    await page.emulateMedia({ colorScheme: "dark" });
    await openList(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Add level" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a level" });
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
        "#create-level-title",
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
    await shot(page, "levels-add-dialog-dark");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(linkOf(page, mine)).toBeVisible();
    await shot(page, "levels-list-dark");
  });

  test("lays out at 390px without scrolling the page sideways — list, form, and dialogs", async ({
    page,
  }) => {
    const mine = await level({ name: `E2E ${RUN} narrow` });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

    await openList(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // The primary action stays in reach: it is outside the table's own scroll.
    const add = page.getByRole("button", { name: "Add level" });
    await expect(add).toBeInViewport({ ratio: 1 });
    await shot(page, "levels-list-mobile");

    await add.click();
    const dialog = page.getByRole("dialog", { name: "Add a level" });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shot(page, "levels-add-dialog-mobile");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await openDetail(page, mine);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(saveButton(page)).toBeVisible();
    await shot(page, "levels-edit-mobile");
    await choose(page, /Status/, "Published");
    await saveButton(page).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toBeVisible();
    const confirmBox = await confirm.boundingBox();
    expect(confirmBox!.x + confirmBox!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shot(page, "levels-status-dialog-mobile");
    await confirm.getByRole("button", { name: "Cancel" }).click();
  });
});
