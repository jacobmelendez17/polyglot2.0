import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

import { GROUP_LIST_MAX, type AdminGroupList } from "@/domains/admin";

import {
  countE2EGroupAudits,
  getE2EAdminScope,
  getE2EGroup,
  getE2EGroupsOfLevel,
  getE2ELevels,
  removeSeededGroups,
  removeSeededLevels,
  seedEmptyLanguage,
  seedGroup,
  seedLevel,
  seedManyGroups,
  seedOtherLanguage,
  setE2EAdminRole,
  snapshotE2EGroups,
  type E2EGroup,
  type E2ELevel,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";
import { ensureLearnerOnboarded } from "../support/e2e-state";
import { spendRateBudget } from "../support/rate-budget";

/**
 * Spec 26 Unit 5 — the Groups index and a group's metadata form, rendered
 * through React Admin, against the real signed-in app and the isolated E2E
 * database. The specialist group-reorder tool is unchanged and is exercised
 * here end to end: it is the only thing that may change a group's position.
 *
 * Every level and group this file needs is created through the real services
 * (see `support/e2e-admin.ts`) or through the UI under test, numbered well away
 * from anything seeded, and removed after each test — groups first, then the
 * levels that held them. Roles other than admin flip the permanent E2E admin
 * identity's *database* role and restore it after every test.
 *
 * Every group write is rate limited as a mutation (30 / 60s) — a real control,
 * never relaxed. The spec spends from it through the shared account in
 * `support/rate-budget.ts` and waits out the window rather than tripping it.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const GROUPS_API = "/api/v1/admin/groups";
const GROUPS_PAGE = "/admin/curriculum/groups";

const RUN = crypto.randomUUID().slice(0, 6);

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial" });

let languageId = "";
/** Levels and groups created by the running test — by the fixtures, or by the UI under test. Removed after it. */
let createdLevels: string[] = [];
let createdGroups: string[] = [];

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  // Children before parents: a level cannot go while a group still names it.
  await removeSeededGroups(createdGroups);
  await removeSeededLevels(createdLevels);
  createdGroups = [];
  createdLevels = [];
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function level(
  options: Parameters<typeof seedLevel>[0] = {},
): Promise<E2ELevel> {
  const made = await seedLevel(options);
  createdLevels.push(made.id);
  return made;
}

async function group(
  inLevel: E2ELevel,
  name: string,
  status?: E2EGroup["status"],
): Promise<E2EGroup> {
  const made = await seedGroup(inLevel.id, { name, status });
  createdGroups.push(made.id);
  return made;
}

/** Finds a group the UI just created (by name, in a level), and queues it for removal. */
async function adopt(levelId: string, name: string): Promise<E2EGroup> {
  const found = (await getE2EGroupsOfLevel(levelId)).find(
    (candidate) => candidate.name === name,
  );
  expect(found, `group "${name}" should exist`).toBeDefined();
  createdGroups.push(found!.id);
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

const table = (page: Page) => page.getByRole("table", { name: "Groups" });
const linkOf = (page: Page, g: Pick<E2EGroup, "name">) =>
  table(page).getByRole("link", { name: g.name, exact: true });
// `has` is evaluated inside each row, so its locator must start at the page —
// one chained from the table would look for a table inside a row.
const rowOf = (page: Page, g: Pick<E2EGroup, "name">) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name: g.name, exact: true }) });

/** The groups a list shows, in the order it shows them. */
const namesShown = (page: Page) =>
  table(page).getByRole("link").allInnerTexts();

async function listReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Groups", exact: true, level: 1 }),
  ).toBeVisible();
  // Whatever the list ends up showing: the table, or one of its empty states.
  await expect(
    table(page)
      .or(page.getByText(/^No vocabulary groups yet/))
      .or(page.getByText("No levels yet for this language")),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

const listUrl = (levelId: string, search = "") =>
  `${GROUPS_PAGE}?language=${languageId}&level=${levelId}${search}`;

async function openList(page: Page, levelId: string, search = "") {
  await page.goto(listUrl(levelId, search));
  await listReady(page);
}

const detailUrl = (id: string) => `${GROUPS_PAGE}/${id}`;

async function openDetail(page: Page, g: Pick<E2EGroup, "id" | "name">) {
  await page.goto(detailUrl(g.id));
  await expect(
    page.getByRole("heading", { name: g.name, level: 1 }),
  ).toBeVisible();
  // The form (or, for a writer, its read-only view) has loaded. Not "no status
  // region": the form keeps an empty one of its own, for announcing "Saved".
  await expect(
    page.getByRole("status").filter({ hasText: "Loading" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Name")
      .or(page.getByText("An Admin edits group properties.")),
  ).toBeVisible();
}

// Exact: the reorder tool has a "Save order" button of its own.
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
      request.method() === method && request.url().includes(GROUPS_API),
  );
}

const denial = (page: Page) =>
  // Scoped by text: Next's own route announcer is a `role="alert"` too.
  page
    .getByRole("alert")
    .filter({ hasText: "You don't have access to this part" });

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("the list", () => {
  test("shows one level's groups in lesson order, matching the database", async ({
    page,
  }) => {
    const mine = await level();
    // Alphabetical (Alpha, Bravo, Charlie) is not position order: the list
    // must follow the position, which is the lesson number learners see.
    const bravo = await group(mine, `${RUN} Bravo`, "published");
    const charlie = await group(mine, `${RUN} Charlie`, "draft");
    const alpha = await group(mine, `${RUN} Alpha`, "archived");

    await openList(page, mine.id);
    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["Lesson", "Group", "Status"],
    );

    const inDatabase = await getE2EGroupsOfLevel(mine.id);
    expect(inDatabase.map((g) => g.name)).toEqual([
      bravo.name,
      charlie.name,
      alpha.name,
    ]);
    expect(await namesShown(page)).toEqual(inDatabase.map((g) => g.name));
    for (const g of inDatabase) {
      const cells = rowOf(page, g).getByRole("cell");
      await expect(cells.nth(0)).toHaveText(String(g.position));
      await expect(cells.nth(2)).toContainText(
        g.status.charAt(0).toUpperCase() + g.status.slice(1),
      );
    }
    // The level being shown is named, never implied.
    await expect(page.getByRole("combobox", { name: /Level/ })).toHaveText(
      `Level ${mine.levelNumber}`,
    );
    await noHash(page);
    await shot(page, "groups-list-light");
  });

  test("shows the same order on every reload — it is the position's, not the browser's", async ({
    page,
  }) => {
    const mine = await level();
    await group(mine, `${RUN} Mango`);
    await group(mine, `${RUN} Apple`);
    await group(mine, `${RUN} Zebra`);

    await openList(page, mine.id);
    const first = await namesShown(page);
    expect(first).toEqual([`${RUN} Mango`, `${RUN} Apple`, `${RUN} Zebra`]);
    for (let reload = 0; reload < 2; reload++) {
      await page.reload();
      await listReady(page);
      expect(await namesShown(page)).toEqual(first);
    }
  });

  test("shows only the selected level's groups, and switching level shows the other's", async ({
    page,
  }) => {
    const one = await level();
    const two = await level();
    const kiwi = await group(two, `${RUN} Kiwi`);
    const mango = await group(one, `${RUN} Mango`);

    await openList(page, one.id);
    await expect(linkOf(page, mango)).toBeVisible();
    await expect(linkOf(page, kiwi)).toHaveCount(0);

    await choose(page, /Level/, `Level ${two.levelNumber}`);
    await expect(page).toHaveURL(new RegExp(`level=${two.id}`));
    await expect(linkOf(page, kiwi)).toBeVisible();
    await expect(linkOf(page, mango)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("language")).toBe(languageId);
    await noHash(page);
  });

  test("carries the language and level in the address — reload, a group's page, and back all return to the same view", async ({
    page,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`);
    await openList(page, mine.id);
    await page.reload();
    await listReady(page);
    await expect(page.getByRole("combobox", { name: /Level/ })).toHaveText(
      `Level ${mine.levelNumber}`,
    );

    await linkOf(page, mango).click();
    await expect(page).toHaveURL(new RegExp(`${detailUrl(mango.id)}$`));
    const back = page.getByRole("link", {
      name: `← Level ${mine.levelNumber} groups`,
    });
    await expect(back).toHaveAttribute(
      "href",
      `${GROUPS_PAGE}?language=${languageId}&level=${mine.id}`,
    );
    await back.click();
    await listReady(page);
    await expect(page).toHaveURL(new RegExp(`level=${mine.id}`));
    await expect(linkOf(page, mango)).toBeVisible();
  });

  test("starts at the language's first level when the address names none or an unknown one", async ({
    page,
  }) => {
    const [first] = await getE2ELevels();
    const inFirst = await getE2EGroupsOfLevel(first!.id);

    for (const search of [
      `language=${languageId}`,
      `language=${languageId}&level=not-a-level`,
      "language=not-a-language",
    ]) {
      await page.goto(`${GROUPS_PAGE}?${search}`);
      await listReady(page);
      await expect(page.getByRole("combobox", { name: /Level/ })).toHaveText(
        `Level ${first!.levelNumber}`,
      );
      expect(await namesShown(page), search).toEqual(
        inFirst.map((g) => g.name),
      );
    }
  });

  test("never mixes languages: another language's level is refused under this one, and switching shows its own groups", async ({
    page,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`);
    const other = await seedOtherLanguage(`zz${RUN}`);
    try {
      await renewSession(page);
      // The API: the other language's level, asked for under this language.
      const crossed = await page.request.get(
        `${GROUPS_API}?language=${languageId}&level=${other.levelId}`,
      );
      expect(crossed.status()).toBe(422);
      expect((await crossed.json()).error.message).toBe(
        "That level doesn't belong to the selected language.",
      );
      // And its own groups are its own.
      const theirs = await page.request.get(
        `${GROUPS_API}?language=${other.languageId}&level=${other.levelId}`,
      );
      expect(theirs.status()).toBe(200);
      const list = (await theirs.json()).data as AdminGroupList;
      expect(list.items.map((item) => item.name)).toEqual(["Other group"]);

      // The screen: two languages now, so the switch appears.
      await openList(page, mine.id);
      await page.getByRole("combobox", { name: /Language/ }).click();
      await page.getByRole("option").filter({ hasText: "E2E Other" }).click();
      await expect(page).toHaveURL(new RegExp(`language=${other.languageId}`));
      await expect(
        table(page).getByRole("link", { name: "Other group" }),
      ).toBeVisible();
      await expect(linkOf(page, mango)).toHaveCount(0);
      // The level followed the language: this one belongs to it.
      await expect(page.getByRole("combobox", { name: /Level/ })).toHaveText(
        "Level 1",
      );

      await page.getByRole("combobox", { name: /Language/ }).click();
      await page
        .getByRole("option")
        .filter({ hasNotText: "E2E Other" })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`language=${languageId}`));
      await noHash(page);
    } finally {
      await other.remove();
    }
  });

  test("invites an Admin to add the first group to a level that has none", async ({
    page,
  }) => {
    const mine = await level();
    await openList(page, mine.id);

    await expect(
      page.getByText(`No vocabulary groups yet in Level ${mine.levelNumber}`),
    ).toBeVisible();
    await expect(
      page.getByText(/Add the first group\. Each new group is added after/),
    ).toBeVisible();
    // The designed empty state stands where the table would be.
    await expect(table(page)).toHaveCount(0);
    // Two ways in: the toolbar's, and the empty state's own.
    await expect(page.getByRole("button", { name: "Add group" })).toHaveCount(
      2,
    );
    await shot(page, "groups-list-empty");
  });

  test("says groups need a level, for a language that has none", async ({
    page,
  }) => {
    const empty = await seedEmptyLanguage();
    try {
      await page.goto(`${GROUPS_PAGE}?language=${empty.languageId}`);
      await expect(
        page.getByText("No levels yet for this language"),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Groups belong to a level. Create a level first, then add groups to it.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Go to Levels" }),
      ).toHaveAttribute(
        "href",
        `/admin/curriculum/levels?language=${empty.languageId}`,
      );
      // Nothing to add a group *to*, and nothing to choose.
      await expect(page.getByRole("button", { name: "Add group" })).toHaveCount(
        0,
      );
      await expect(page.getByRole("combobox", { name: /Level/ })).toHaveCount(
        0,
      );
      await expect(table(page)).toHaveCount(0);
      await shot(page, "groups-list-no-levels");
    } finally {
      await empty.remove();
    }
  });

  test("the whole row is a click target, and the link works from the keyboard", async ({
    page,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`);
    await openList(page, mine.id);

    // A cell that is not the link. The link's overlay covers it by design, so
    // Playwright's "is anything intercepting?" check would refuse; `force`
    // skips that check but still performs a real mouse click, which the
    // browser hit-tests to the overlay and follows.
    await rowOf(page, mango).getByRole("cell").nth(2).click({ force: true });
    await expect(page).toHaveURL(new RegExp(`${detailUrl(mango.id)}$`));

    await openList(page, mine.id);
    await linkOf(page, mango).focus();
    await expect(linkOf(page, mango)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${detailUrl(mango.id)}$`));
  });

  test("a group's page for an id that is not a group is a 404 — well-formed or not — never a fault", async ({
    page,
  }) => {
    for (const id of [crypto.randomUUID(), "not-an-id"]) {
      const response = await page.goto(detailUrl(id));
      expect(response?.status(), id).toBe(404);
    }
  });

  test("is bounded, and says so when a level has more groups than it shows", async ({
    page,
  }) => {
    const mine = await level();
    createdGroups.push(...(await seedManyGroups(mine.id, GROUP_LIST_MAX + 1)));

    await renewSession(page);
    const response = await page.request.get(
      `${GROUPS_API}?language=${languageId}&level=${mine.id}`,
    );
    const list = (await response.json()).data as AdminGroupList;
    expect(list.items).toHaveLength(GROUP_LIST_MAX);
    expect(list.truncated).toBe(true);
    // The first of them, by position — not an arbitrary hundred.
    expect(list.items.map((item) => item.position)).toEqual(
      Array.from({ length: GROUP_LIST_MAX }, (_, index) => index + 1),
    );

    await openList(page, mine.id);
    await expect(
      page.getByText(`Showing the first ${GROUP_LIST_MAX} groups.`),
    ).toBeVisible();
    // The header row, then exactly the bound.
    await expect(table(page).getByRole("row")).toHaveCount(GROUP_LIST_MAX + 1);
  });
});

/* -------------------------------------------------------------------------- */
/* Adding a group                                                             */
/* -------------------------------------------------------------------------- */

test.describe("adding a group", () => {
  async function openDialog(page: Page): Promise<Locator> {
    await page.getByRole("button", { name: "Add group" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a vocabulary group" });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  const submit = (dialog: Locator) =>
    dialog.getByRole("button", { name: /^(Add group|Adding…)$/ });

  test("adds a draft at the end of the level, once, and lands on its page — without touching any other group", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const elsewhere = await level();
    await group(mine, `${RUN} Mango`);
    await group(mine, `${RUN} Apple`);
    await group(elsewhere, `${RUN} Kiwi`);
    const elsewhereBefore = await snapshotE2EGroups(elsewhere.id);
    const name = `E2E ${RUN} added`;
    await openList(page, mine.id);

    const dialog = await openDialog(page);
    await expect(dialog).toContainText(
      `New groups are added after the existing groups in Level ${mine.levelNumber}.`,
    );
    // No level to pick (the filter is where a level is chosen) and no position to type.
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await shot(page, "groups-add-dialog");
    await dialog.getByLabel("Name").fill(`  ${name}  `);
    await submit(dialog).click();

    await expect
      .poll(async () => (await getE2EGroupsOfLevel(mine.id)).length)
      .toBe(3);
    const added = await adopt(mine.id, name);
    await expect(page).toHaveURL(new RegExp(`${detailUrl(added.id)}$`));
    expect(added).toMatchObject({
      name,
      status: "draft",
      levelId: mine.id,
      languageId,
      position: 3,
    });
    // Appended: what was there is exactly where it was.
    expect(await snapshotE2EGroups(mine.id)).toEqual([
      [`${RUN} Mango`, 1],
      [`${RUN} Apple`, 2],
      [name, 3],
    ]);
    // And no other level's groups were renumbered.
    expect(await snapshotE2EGroups(elsewhere.id)).toEqual(elsewhereBefore);
    expect(await countE2EGroupAudits("GROUP_CREATED", added.id)).toBe(1);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  });

  test("adds to the level the list is showing, and the new group is there when the list is next opened", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const name = `${RUN} First`;
    await openList(page, mine.id);

    const dialog = await openDialog(page);
    await dialog.getByLabel("Name").fill(name);
    await submit(dialog).click();
    await expect
      .poll(async () => (await getE2EGroupsOfLevel(mine.id)).length)
      .toBe(1);
    const added = await adopt(mine.id, name);
    expect(added.position).toBe(1);

    await openList(page, mine.id);
    await expect(linkOf(page, added)).toBeVisible();
    await expect(rowOf(page, added).getByRole("cell").nth(0)).toHaveText("1");
  });

  test("explains what is wrong with the name, in the dialog, and sends nothing", async ({
    page,
  }) => {
    const mine = await level();
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes(GROUPS_API))
        posts.push(request.url());
    });
    await openList(page, mine.id);
    const dialog = await openDialog(page);
    const nameField = dialog.getByLabel("Name");

    await nameField.fill("   ");
    await submit(dialog).click();
    await expect(
      dialog.getByText("Enter a name for this group."),
    ).toBeVisible();

    await nameField.fill("x".repeat(201));
    await submit(dialog).click();
    await expect(
      dialog.getByText("Keep the name to 200 characters or fewer."),
    ).toBeVisible();

    expect(posts).toEqual([]);
    expect(await getE2EGroupsOfLevel(mine.id)).toEqual([]);
  });

  test("changes nothing when cancelled, and a reopened dialog starts empty", async ({
    page,
  }) => {
    const mine = await level();
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes(GROUPS_API))
        posts.push(request.url());
    });
    await openList(page, mine.id);
    let dialog = await openDialog(page);
    await dialog.getByLabel("Name").fill("Half-typed");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    dialog = await openDialog(page);
    await expect(dialog.getByLabel("Name")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(posts).toEqual([]);
    expect(await getE2EGroupsOfLevel(mine.id)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Editing a group's properties                                               */
/* -------------------------------------------------------------------------- */

test.describe("editing a group's properties", () => {
  test("renames a group, sends only the name, updates the heading — and it is the same group, in the same place, after a reload", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    await group(mine, `${RUN} First`);
    const before = await group(mine, `${RUN} before`, "published");
    await group(mine, `${RUN} Third`);
    const siblings = await snapshotE2EGroups(mine.id);
    // Seeding it "published" went through the real `updateVocabularyGroup`,
    // which audits: what matters below is the one event the *edit* adds.
    const auditedBefore = await countE2EGroupAudits("GROUP_UPDATED", before.id);
    await openDetail(page, before);

    await expect(page.getByLabel("Name")).toHaveValue(before.name);
    await expect(page.getByRole("combobox", { name: /Status/ })).toHaveText(
      "Published",
    );
    await expect(saveButton(page)).toBeDisabled();
    await shot(page, "groups-edit-form");

    const name = `${RUN} after`;
    await page.getByLabel("Name").fill(name);
    await expect(saveButton(page)).toBeEnabled();
    const sent = captureRequest(page, "PATCH");
    await saveButton(page).click();

    const body = JSON.parse((await sent).postData()!);
    // Only what changed — not the status, which someone else may have changed.
    expect(Object.keys(body)).toEqual(["name", "idempotencyKey"]);
    expect(body.name).toBe(name);

    await expect(page.getByText("Saved")).toBeVisible();
    // The heading is rendered by the server; the form asked it to re-render.
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(saveButton(page)).toBeDisabled();

    expect(await getE2EGroup(before.id)).toMatchObject({
      name,
      status: "published",
      position: before.position,
      levelId: mine.id,
    });
    expect(await countE2EGroupAudits("GROUP_UPDATED", before.id)).toBe(
      auditedBefore + 1,
    );

    // After a reload: the same group, with what was saved.
    await page.reload();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue(name);
    await expect(page.getByRole("combobox", { name: /Status/ })).toHaveText(
      "Published",
    );
    await expect(page).toHaveURL(new RegExp(`${detailUrl(before.id)}$`));

    // Every sibling is exactly where it was; only the one name changed.
    expect(await snapshotE2EGroups(mine.id)).toEqual(
      siblings.map(([existing, position]) =>
        existing === before.name ? [name, position] : [existing, position],
      ),
    );

    // And the list shows it in the same lesson.
    await openList(page, mine.id);
    await expect(rowOf(page, { name }).getByRole("cell").nth(0)).toHaveText(
      String(before.position),
    );
  });

  test("saves a status that is not archiving without asking, and the list shows it", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const before = await group(mine, `${RUN} Fruit`);
    await openDetail(page, before);

    await choose(page, /Status/, "Published");
    await saveButton(page).click();

    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await getE2EGroup(before.id))?.status).toBe("published");
    expect(await countE2EGroupAudits("GROUP_UPDATED", before.id)).toBe(1);

    await page.reload();
    await expect(page.getByRole("combobox", { name: /Status/ })).toHaveText(
      "Published",
    );
    await openList(page, mine.id);
    await expect(rowOf(page, before).getByRole("cell").nth(2)).toContainText(
      "Published",
    );
  });

  test("asks before archiving — and then archives, as the old form did", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const before = await group(mine, `${RUN} Fruit`, "published");
    // Seeding it "published" audited an update; archiving must add none of its own.
    const updatedBefore = await countE2EGroupAudits("GROUP_UPDATED", before.id);
    await openDetail(page, before);

    await choose(page, /Status/, "Archived");
    await saveButton(page).click();

    const dialog = page.getByRole("dialog", {
      name: `Archive “${before.name}”?`,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Archived groups stay on record");
    await expect(dialog).toContainText(
      "Existing vocabulary items keep their group assignment.",
    );
    await expect(dialog).toContainText("Status: Published → Archived");
    await shot(page, "groups-archive-dialog");
    // Opening the dialog changed nothing.
    expect((await getE2EGroup(before.id))?.status).toBe("published");

    await dialog.getByRole("button", { name: "Archive" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Saved")).toBeVisible();

    expect(await getE2EGroup(before.id)).toMatchObject({
      status: "archived",
      position: before.position,
    });
    // Recorded as an archive, not as an ordinary edit.
    expect(await countE2EGroupAudits("GROUP_ARCHIVED", before.id)).toBe(1);
    expect(await countE2EGroupAudits("GROUP_UPDATED", before.id)).toBe(
      updatedBefore,
    );
  });

  test("Cancel on that question changes nothing", async ({ page }) => {
    const mine = await level();
    const before = await group(mine, `${RUN} Fruit`);
    await openDetail(page, before);
    await choose(page, /Status/, "Archived");
    await saveButton(page).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toHaveCount(0);
    expect((await getE2EGroup(before.id))?.status).toBe("draft");
    expect(await countE2EGroupAudits("GROUP_ARCHIVED", before.id)).toBe(0);
    // The choice is still there to reconsider.
    await expect(page.getByRole("combobox", { name: /Status/ })).toHaveText(
      "Archived",
    );
  });

  test("refuses a blank name in the form, and sends nothing", async ({
    page,
  }) => {
    const mine = await level();
    const before = await group(mine, `${RUN} Fruit`);
    const patches: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes(GROUPS_API))
        patches.push(request.url());
    });
    await openDetail(page, before);

    await page.getByLabel("Name").fill("   ");
    await saveButton(page).click();

    await expect(page.getByText("Enter a name for this group.")).toBeVisible();
    expect(patches).toEqual([]);
    expect((await getE2EGroup(before.id))?.name).toBe(before.name);
  });

  test("changes one group and leaves its siblings and its own position alone", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const elsewhere = await level();
    await group(mine, `${RUN} One`, "published");
    const middle = await group(mine, `${RUN} Two`, "draft");
    await group(mine, `${RUN} Three`, "archived");
    await group(elsewhere, `${RUN} Other`);
    const otherBefore = await getE2EGroupsOfLevel(elsewhere.id);
    const mineBefore = await getE2EGroupsOfLevel(mine.id);
    await openDetail(page, middle);

    await page.getByLabel("Name").fill(`${RUN} Two, renamed`);
    await choose(page, /Status/, "Pending");
    await saveButton(page).click();
    await expect(page.getByText("Saved")).toBeVisible();

    const after = await getE2EGroupsOfLevel(mine.id);
    expect(after.map((g) => g.position)).toEqual([1, 2, 3]);
    for (const [index, g] of after.entries()) {
      const was = mineBefore[index]!;
      expect(g.id).toBe(was.id);
      if (g.id === middle.id) {
        expect(g).toMatchObject({
          name: `${RUN} Two, renamed`,
          status: "pending",
        });
      } else {
        expect(g).toEqual(was);
      }
    }
    expect(await getE2EGroupsOfLevel(elsewhere.id)).toEqual(otherBefore);
  });

  test("is operable by keyboard alone", async ({ page }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const before = await group(mine, `${RUN} keys`);
    await openDetail(page, before);

    await page.getByLabel("Name").focus();
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    await saveButton(page).focus();
    await expect(saveButton(page)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("Saved")).toBeVisible();
    expect((await getE2EGroup(before.id))?.name).toBe(`${RUN} keys!`);
  });
});

/* -------------------------------------------------------------------------- */
/* Reordering — the specialist tool, unchanged                                */
/* -------------------------------------------------------------------------- */

test.describe("reordering groups", () => {
  const reorderList = (page: Page) => page.getByRole("list");
  const up = (page: Page, g: Pick<E2EGroup, "name">) =>
    page.getByRole("button", { name: `Move ${g.name} up` });
  const saveOrder = (page: Page) =>
    page.getByRole("button", { name: "Save order" });

  async function reorderReady(page: Page) {
    await expect(
      page.getByRole("heading", { name: "Groups", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(saveOrder(page)).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  }

  test("is reached from the list, for the same language and level, and back again", async ({
    page,
  }) => {
    const mine = await level();
    await group(mine, `${RUN} Bravo`);
    await group(mine, `${RUN} Alpha`);
    await openList(page, mine.id);

    const entry = page.getByRole("link", { name: "Reorder groups" });
    await expect(entry).toHaveAttribute(
      "href",
      `${GROUPS_PAGE}?language=${languageId}&level=${mine.id}&mode=reorder`,
    );
    await entry.click();
    await reorderReady(page);

    // The specialist tool, as it was: rows in order, Up/Down buttons, Save order.
    await expect(
      page.getByText(
        `Reordering the groups of Level ${mine.levelNumber}. The order here is the order of its lessons.`,
      ),
    ).toBeVisible();
    await expect(reorderList(page).getByRole("listitem")).toHaveText([
      new RegExp(`${RUN} Bravo`),
      new RegExp(`${RUN} Alpha`),
    ]);
    await expect(saveOrder(page)).toBeDisabled();
    await shot(page, "groups-reorder-tool");

    const back = page.getByRole("link", { name: "← Back to browsing" });
    await expect(back).toHaveAttribute(
      "href",
      `${GROUPS_PAGE}?language=${languageId}&level=${mine.id}`,
    );
    await back.click();
    await listReady(page);
    await expect(
      table(page).getByRole("link", { name: `${RUN} Bravo` }),
    ).toBeVisible();
  });

  test("offers the way in only where there is something to put in order", async ({
    page,
  }) => {
    const mine = await level();
    await group(mine, `${RUN} Only`);
    await openList(page, mine.id);

    await expect(page.getByRole("table", { name: "Groups" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Reorder groups" }),
    ).toHaveCount(0);
  });

  test("saves a new order for one level — the list shows it after a reload, and no other level's groups move", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation");
    const mine = await level();
    const elsewhere = await level();
    const bravo = await group(mine, `${RUN} Bravo`);
    const charlie = await group(mine, `${RUN} Charlie`);
    const alpha = await group(mine, `${RUN} Alpha`);
    await group(elsewhere, `${RUN} Xray`);
    await group(elsewhere, `${RUN} Yankee`);
    const elsewhereBefore = await getE2EGroupsOfLevel(elsewhere.id);
    await page.goto(listUrl(mine.id, "&mode=reorder"));
    await reorderReady(page);

    // [Bravo, Charlie, Alpha] → [Alpha, Bravo, Charlie]
    await up(page, alpha).click();
    await up(page, alpha).click();
    await expect(saveOrder(page)).toBeEnabled();
    await saveOrder(page).click();

    await expect
      .poll(async () => (await snapshotE2EGroups(mine.id)).map(([n]) => n))
      .toEqual([alpha.name, bravo.name, charlie.name]);
    expect(await snapshotE2EGroups(mine.id)).toEqual([
      [alpha.name, 1],
      [bravo.name, 2],
      [charlie.name, 3],
    ]);
    // The save is done: the tool has nothing left to save.
    await expect(saveOrder(page)).toBeDisabled();
    expect(await countE2EGroupAudits("GROUP_REORDERED", mine.id)).toBe(1);

    // Another level, exactly as it was — ids, names, positions, statuses.
    expect(await getE2EGroupsOfLevel(elsewhere.id)).toEqual(elsewhereBefore);

    // After a reload, the browsing list shows the new order, as lesson numbers.
    await openList(page, mine.id);
    expect(await namesShown(page)).toEqual([
      alpha.name,
      bravo.name,
      charlie.name,
    ]);
    for (const [index, name] of [
      alpha.name,
      bravo.name,
      charlie.name,
    ].entries()) {
      await expect(rowOf(page, { name }).getByRole("cell").nth(0)).toHaveText(
        String(index + 1),
      );
    }
    // The groups are the same groups: reordering never replaces one.
    expect((await getE2EGroup(alpha.id))?.id).toBe(alpha.id);
  });

  test("an Admin who is no longer one is refused on Save, and the order is unchanged", async ({
    page,
  }) => {
    const mine = await level();
    const bravo = await group(mine, `${RUN} Bravo`);
    const alpha = await group(mine, `${RUN} Alpha`);
    await page.goto(listUrl(mine.id, "&mode=reorder"));
    await reorderReady(page);
    await up(page, alpha).click();
    await expect(saveOrder(page)).toBeEnabled();

    // The page still believes this person is an Admin; the database no longer does.
    await setE2EAdminRole("writer");
    await saveOrder(page).click();

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "You don't have access to do that." }),
    ).toBeVisible();
    expect(await snapshotE2EGroups(mine.id)).toEqual([
      [bravo.name, 1],
      [alpha.name, 2],
    ]);
    expect(await countE2EGroupAudits("GROUP_REORDERED", mine.id)).toBe(0);
  });

  test("a writer who types the reorder address gets the browsing list, not the tool", async ({
    page,
  }) => {
    const mine = await level();
    await group(mine, `${RUN} Bravo`);
    await group(mine, `${RUN} Alpha`);
    await setE2EAdminRole("writer");

    await page.goto(listUrl(mine.id, "&mode=reorder"));
    await listReady(page);

    await expect(saveOrder(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Move .* (up|down)$/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Reorder groups" }),
    ).toHaveCount(0);
    await expect(
      table(page).getByRole("link", { name: `${RUN} Bravo` }),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("roles", () => {
  test("a writer sees every group and its properties, with no way to add, change or reorder one — and is refused if they try", async ({
    page,
    baseURL,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`, "published");
    await group(mine, `${RUN} Apple`);
    const before = await getE2EGroupsOfLevel(mine.id);
    // Seeding went through the real services, which audit: what matters below
    // is that the writer's attempts add nothing to this.
    const auditedBefore = await countE2EGroupAudits("GROUP_UPDATED", mango.id);
    await setE2EAdminRole("writer");

    await openList(page, mine.id);
    await expect(linkOf(page, mango)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add group" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "Reorder groups" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("You can see every group. An Admin adds and edits them."),
    ).toBeVisible();
    await shot(page, "groups-list-writer");

    await linkOf(page, mango).click();
    await expect(
      page.getByRole("heading", { name: mango.name, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("An Admin edits group properties."),
    ).toBeVisible();
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(saveButton(page)).toHaveCount(0);
    await shot(page, "groups-edit-writer");

    // Reading is allowed; the commands are not — whatever the page drew.
    const headers = fromThisApp(originOf(baseURL));
    expect(
      (
        await page.request.get(
          `${GROUPS_API}?language=${languageId}&level=${mine.id}`,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(GROUPS_API, {
          headers,
          data: {
            languageId,
            levelId: mine.id,
            name: "Hijacked",
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${GROUPS_API}/${mango.id}`, {
          headers,
          data: { name: "Hijacked", idempotencyKey: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(403);
    expect(await getE2EGroupsOfLevel(mine.id)).toEqual(before);
    expect(await countE2EGroupAudits("GROUP_UPDATED", mango.id)).toBe(
      auditedBefore,
    );
  });

  test("a developer is turned away from both pages and all three endpoints", async ({
    page,
    baseURL,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`);
    await setE2EAdminRole("developer");

    for (const path of [GROUPS_PAGE, detailUrl(mango.id)] as const) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
    }
    await page.waitForFunction(() =>
      Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    );

    const headers = fromThisApp(originOf(baseURL));
    expect(
      (
        await page.request.get(
          `${GROUPS_API}?language=${languageId}&level=${mine.id}`,
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(GROUPS_API, {
          headers,
          data: {
            languageId,
            levelId: mine.id,
            name: "No",
            idempotencyKey: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch(`${GROUPS_API}/${mango.id}`, {
          headers,
          data: { name: "No", idempotencyKey: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(403);
    expect(await getE2EGroupsOfLevel(mine.id)).toHaveLength(1);
  });

  test("a role revoked while the Add dialog is open is refused by the server, and nothing is added", async ({
    page,
  }) => {
    const mine = await level();
    await openList(page, mine.id);
    await page.getByRole("button", { name: "Add group" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a vocabulary group" });
    await dialog.getByLabel("Name").fill(`${RUN} Behind their back`);

    // The page still believes this person is an Admin; the database no longer does.
    await setE2EAdminRole("writer");
    await dialog.getByRole("button", { name: "Add group" }).click();

    await expect(dialog).toContainText(
      "You don't have access to this part of the admin console.",
    );
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^(Add group|Cancel)$/ }),
    ).toHaveCount(0);
    expect(await getE2EGroupsOfLevel(mine.id)).toEqual([]);
  });

  test("a role revoked while a group's form is open is refused on Save, and nothing changes", async ({
    page,
  }) => {
    const mine = await level();
    const before = await group(mine, `${RUN} revoked`);
    await openDetail(page, before);
    await page.getByLabel("Name").fill("Changed behind their back");

    await setE2EAdminRole("writer");
    await saveButton(page).click();

    await expect(denial(page)).toBeVisible();
    expect((await getE2EGroup(before.id))?.name).toBe(before.name);
    expect(await countE2EGroupAudits("GROUP_UPDATED", before.id)).toBe(0);
  });

  test("a role revoked while the list is open takes the buttons away on refocus", async ({
    page,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`);
    await group(mine, `${RUN} Apple`);
    await openList(page, mine.id);
    await expect(page.getByRole("button", { name: "Add group" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Reorder groups" }),
    ).toBeVisible();

    await setE2EAdminRole("writer");
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    await expect(page.getByRole("button", { name: "Add group" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "Reorder groups" }),
    ).toHaveCount(0);
    // They can still read the groups.
    await expect(linkOf(page, mango)).toBeVisible();
  });

  test("a role revoked entirely replaces the list with access-denied", async ({
    page,
  }) => {
    const mine = await level();
    await group(mine, `${RUN} Mango`);
    await openList(page, mine.id);

    await setE2EAdminRole("user");
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    await expect(denial(page)).toBeVisible();
    // Privileged rows must not linger beside the denial.
    await expect(table(page)).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* What the endpoints refuse                                                  */
/* -------------------------------------------------------------------------- */

test.describe("what the endpoints refuse", () => {
  let home: E2ELevel;
  let target: E2EGroup;
  let targetLevels: string[] = [];
  let targetGroups: string[] = [];

  test.beforeAll(async () => {
    home = await seedLevel();
    target = await seedGroup(home.id, { name: `${RUN} target` });
    targetLevels = [home.id];
    targetGroups = [target.id];
  });
  test.afterAll(async () => {
    await removeSeededGroups(targetGroups);
    await removeSeededLevels(targetLevels);
  });

  const createBody = (name = `${RUN} nope`) => ({
    languageId,
    levelId: home.id,
    name,
    idempotencyKey: crypto.randomUUID(),
  });
  const patchBody = { name: "Nope", idempotencyKey: crypto.randomUUID() };
  const untouched = async () => {
    expect(await snapshotE2EGroups(home.id)).toEqual([[`${RUN} target`, 1]]);
    expect(await getE2EGroup(target.id)).toMatchObject({
      name: `${RUN} target`,
      status: "draft",
    });
    expect(await countE2EGroupAudits("GROUP_UPDATED", target.id)).toBe(0);
  };

  test("a cross-site page cannot add or change a group as a signed-in Admin", async ({
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
      const create = await page.request.post(GROUPS_API, {
        headers,
        data: createBody(),
      });
      expect(create.status(), `POST, ${name}`).toBe(403);
      const update = await page.request.patch(`${GROUPS_API}/${target.id}`, {
        headers,
        data: patchBody,
      });
      expect(update.status(), `PATCH, ${name}`).toBe(403);
    }
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
      const response = await page.request.patch(`${GROUPS_API}/${target.id}`, {
        headers: fromThisApp(originOf(baseURL), type),
        data: JSON.stringify(patchBody),
      });
      expect(response.status(), type).toBe(415);
    }
    const inQuery = await page.request.patch(
      `${GROUPS_API}/${target.id}?name=Nope`,
      { headers, data: patchBody },
    );
    expect(inQuery.status()).toBe(422);
    const big = await page.request.patch(`${GROUPS_API}/${target.id}`, {
      headers,
      data: JSON.stringify({ ...patchBody, padding: "x".repeat(10_000) }),
    });
    expect(big.status()).toBe(413);
    await untouched();
  });

  test("malformed and over-eager bodies are refused with the rules the old action enforced — and a position is never accepted", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const key = crypto.randomUUID();
    const creates: [string, unknown][] = [
      ["invalid JSON", "{not json"],
      ["no name", { ...createBody(), name: undefined }],
      ["a name of only spaces", createBody("   ")],
      ["a name over 200 characters", createBody("x".repeat(201))],
      ["a position", { ...createBody(), position: 1 }],
      ["a status on create", { ...createBody(), status: "published" }],
      ["an actor", { ...createBody(), actorUserId: crypto.randomUUID() }],
      ["a non-UUID level", { ...createBody(), levelId: "level-1" }],
      ["a non-UUID key", { ...createBody(), idempotencyKey: "retry-1" }],
    ];
    for (const [name, data] of creates) {
      const response = await page.request.post(GROUPS_API, {
        headers,
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
      expect(response.status(), name).toBe(422);
    }
    const updates: [string, unknown][] = [
      ["nothing to change", { idempotencyKey: key }],
      ["an unknown status", { status: "live", idempotencyKey: key }],
      ["a cleared status", { status: null, idempotencyKey: key }],
      ["a cleared name", { name: null, idempotencyKey: key }],
      ["an empty name", { name: "", idempotencyKey: key }],
      // Moving and ordering are not this command's.
      ["a position", { position: 1, idempotencyKey: key }],
      ["a level", { levelId: home.id, idempotencyKey: key }],
      [
        "another group in the body",
        { name: "x", groupId: target.id, idempotencyKey: key },
      ],
      ["an actor", { name: "x", actorUserId: key, idempotencyKey: key }],
    ];
    for (const [name, data] of updates) {
      const response = await page.request.patch(`${GROUPS_API}/${target.id}`, {
        headers,
        data: JSON.stringify(data),
      });
      expect(response.status(), name).toBe(422);
    }
    await untouched();
  });

  test("an unknown language, level, or group is a 404 or 422 — never a silent success or a fault", async ({
    page,
    baseURL,
  }) => {
    // The update of a group that is not there reaches the service (which is
    // where it is found missing), so it is counted against the limit.
    await spendRateBudget("admin-mutation");
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const stranger = crypto.randomUUID();

    expect(
      (
        await page.request.get(
          `${GROUPS_API}?language=${stranger}&level=${home.id}`,
        )
      ).status(),
    ).toBe(404);
    // A level that is not there, or not this language's, is the caller's mistake.
    for (const level of [stranger, "not-an-id"]) {
      expect(
        (
          await page.request.get(
            `${GROUPS_API}?language=${languageId}&level=${level}`,
          )
        ).status(),
        level,
      ).toBe(422);
    }
    const nowhere = await page.request.post(GROUPS_API, {
      headers,
      data: { ...createBody(), levelId: stranger },
    });
    expect(nowhere.status()).toBe(422);
    expect((await nowhere.json()).error.message).toBe(
      "That level doesn't belong to the selected language.",
    );
    expect(
      (
        await page.request.post(GROUPS_API, {
          headers,
          data: { ...createBody(), languageId: stranger },
        })
      ).status(),
    ).toBe(404);

    // A group that is not there: refused, and no audit event for it.
    const missing = await page.request.patch(`${GROUPS_API}/${stranger}`, {
      headers,
      data: patchBody,
    });
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error.message).toBe(
      "That group could not be found.",
    );
    expect(await countE2EGroupAudits("GROUP_UPDATED", stranger)).toBe(0);

    expect(
      (
        await page.request.patch(`${GROUPS_API}/not-an-id`, {
          headers,
          data: patchBody,
        })
      ).status(),
    ).toBe(422);

    // The list endpoint takes a language and a level, and nothing else.
    for (const query of [
      "",
      `language=${languageId}`,
      `level=${home.id}`,
      `language=${languageId}&level=${home.id}&sort=name`,
      `language=${languageId}&level=${home.id}&limit=5`,
      `language=${languageId}&level=${home.id}&cursor=x`,
    ]) {
      expect(
        (await page.request.get(`${GROUPS_API}?${query}`)).status(),
        query,
      ).toBe(422);
    }
    await untouched();
  });

  test("each endpoint answers only its own methods", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    expect((await page.request.delete(GROUPS_API, { headers })).status()).toBe(
      405,
    );
    expect(
      (await page.request.patch(GROUPS_API, { headers, data: {} })).status(),
    ).toBe(405);
    expect(
      (await page.request.get(`${GROUPS_API}/${target.id}`)).status(),
    ).toBe(405);
    expect(
      (
        await page.request.post(`${GROUPS_API}/${target.id}`, {
          headers,
          data: patchBody,
        })
      ).status(),
    ).toBe(405);
    expect(
      (
        await page.request.delete(`${GROUPS_API}/${target.id}`, { headers })
      ).status(),
    ).toBe(405);
    await untouched();
  });

  test("an anonymous caller gets 401 and a learner 403, from every endpoint", async ({
    browser,
    baseURL,
  }) => {
    const headers = fromThisApp(originOf(baseURL));
    const calls = (request: Page["request"]) => [
      () =>
        request.get(`${GROUPS_API}?language=${languageId}&level=${home.id}`),
      () => request.post(GROUPS_API, { headers, data: createBody() }),
      () =>
        request.patch(`${GROUPS_API}/${target.id}`, {
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
    await untouched();
  });

  test("privileged responses are never cached", async ({ page, baseURL }) => {
    await spendRateBudget("admin-mutation", 2);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));

    const read = await page.request.get(
      `${GROUPS_API}?language=${languageId}&level=${home.id}`,
    );
    expect(read.headers()["cache-control"]).toContain("no-store");
    const made = await page.request.post(GROUPS_API, {
      headers,
      data: createBody(`${RUN} cache`),
    });
    expect(made.status()).toBe(200);
    expect(made.headers()["cache-control"]).toContain("no-store");
    const { groupId } = (await made.json()).data;
    createdGroups.push(groupId);
    const changed = await page.request.patch(`${GROUPS_API}/${groupId}`, {
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
    const fresh = await level();
    const key = crypto.randomUUID();
    const body = (name: string) => ({
      languageId,
      levelId: fresh.id,
      name,
      idempotencyKey: key,
    });

    // Create: sent twice, as a retry after a lost response would send it.
    const first = await page.request.post(GROUPS_API, {
      headers,
      data: body(`${RUN} once`),
    });
    expect(first.status()).toBe(200);
    const { groupId } = (await first.json()).data;
    createdGroups.push(groupId);
    const replay = await page.request.post(GROUPS_API, {
      headers,
      data: body(`${RUN} once`),
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data.groupId).toBe(groupId);
    // One group, one audit event — not two.
    expect(await getE2EGroupsOfLevel(fresh.id)).toHaveLength(1);
    expect(await countE2EGroupAudits("GROUP_CREATED", groupId)).toBe(1);

    // The same key for a different name is a different request: refused.
    const reused = await page.request.post(GROUPS_API, {
      headers,
      data: body(`${RUN} twice`),
    });
    expect(reused.status()).toBe(409);
    expect(await getE2EGroupsOfLevel(fresh.id)).toHaveLength(1);

    // Update: the same, with PATCH.
    const updateKey = crypto.randomUUID();
    const patch = { name: "Renamed once", idempotencyKey: updateKey };
    expect(
      (
        await page.request.patch(`${GROUPS_API}/${groupId}`, {
          headers,
          data: patch,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch(`${GROUPS_API}/${groupId}`, {
          headers,
          data: patch,
        })
      ).status(),
    ).toBe(200);
    expect(await countE2EGroupAudits("GROUP_UPDATED", groupId)).toBe(1);
    expect(
      (
        await page.request.patch(`${GROUPS_API}/${groupId}`, {
          headers,
          data: { name: "Renamed twice", idempotencyKey: updateKey },
        })
      ).status(),
    ).toBe(409);
    expect((await getE2EGroup(groupId))?.name).toBe("Renamed once");
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables", async ({
    page,
  }) => {
    const mine = await level();
    const mango = await group(mine, `${RUN} Mango`);
    await group(mine, `${RUN} Apple`);
    await page.emulateMedia({ colorScheme: "dark" });
    await openList(page, mine.id);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Add group" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add a vocabulary group" });
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
        "#create-group-title",
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
    await shot(page, "groups-add-dialog-dark");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(linkOf(page, mango)).toBeVisible();
    await shot(page, "groups-list-dark");
  });

  test("lays out at 390px without scrolling the page sideways — list, form, and dialogs", async ({
    page,
  }) => {
    const mine = await level({ name: `E2E ${RUN} narrow` });
    await group(mine, `${RUN} A fairly long group name that has to wrap`);
    const second = await group(mine, `${RUN} Second`, "published");
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

    await openList(page, mine.id);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Three short columns fit the table's own frame, so nothing is scrolled out
    // of sight inside it — a clipped Status badge is invisible to the page-level
    // check above, because the table scrolls within its frame.
    expect(
      await page.evaluate(() => {
        const frame = document.querySelector(
          ".RaDataTable-tableWrapper",
        ) as HTMLElement;
        return frame.scrollWidth - frame.clientWidth;
      }),
    ).toBeLessThanOrEqual(0);
    // The primary action stays in reach: it is outside the table's own scroll.
    const add = page.getByRole("button", { name: "Add group" }).first();
    await expect(add).toBeInViewport({ ratio: 1 });
    await shot(page, "groups-list-mobile");

    await add.click();
    const dialog = page.getByRole("dialog", { name: "Add a vocabulary group" });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shot(page, "groups-add-dialog-mobile");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await openDetail(page, second);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(saveButton(page)).toBeVisible();
    await shot(page, "groups-edit-mobile");
    await choose(page, /Status/, "Archived");
    await saveButton(page).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toBeVisible();
    const confirmBox = await confirm.boundingBox();
    expect(confirmBox!.x + confirmBox!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shot(page, "groups-archive-dialog-mobile");
    await confirm.getByRole("button", { name: "Cancel" }).click();

    // The specialist tool, too.
    await page.goto(listUrl(mine.id, "&mode=reorder"));
    await expect(
      page.getByRole("button", { name: "Save order" }),
    ).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shot(page, "groups-reorder-mobile");
  });
});

/* -------------------------------------------------------------------------- */
/* What learners see                                                          */
/* -------------------------------------------------------------------------- */

test.describe("what learners see", () => {
  test("a level whose groups were reordered still renders for learners — no placeholder position is left behind", async ({
    page,
    browser,
  }) => {
    await spendRateBudget("admin-mutation");
    await ensureLearnerOnboarded();
    // Inside the learner-facing range (1–50), so a learner can open its page —
    // and published, so the page lists it.
    const mine = await level({
      from: 30,
      to: 49,
      name: `E2E ${RUN} lessons`,
      status: "published",
    });
    const apple = await group(mine, `${RUN} Apple`, "published");
    const zebra = await group(mine, `${RUN} Zebra`, "published");
    // A group with no published items is omitted from the learner's page (an
    // empty lesson is clutter), so what is checked is what the page reads — the
    // positions — and that the page still renders over them. The reorder is
    // two-phase (negative placeholders, then the final positions): nothing may
    // be left in between.
    expect(await snapshotE2EGroups(mine.id)).toEqual([
      [apple.name, 1],
      [zebra.name, 2],
    ]);
    await page.goto(listUrl(mine.id, "&mode=reorder"));
    await expect(
      page.getByRole("button", { name: "Save order" }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Move ${zebra.name} up` }).click();
    await page.getByRole("button", { name: "Save order" }).click();
    await expect
      .poll(async () => snapshotE2EGroups(mine.id))
      .toEqual([
        [zebra.name, 1],
        [apple.name, 2],
      ]);
    expect(
      (await getE2EGroupsOfLevel(mine.id)).every((g) => g.position >= 1),
    ).toBe(true);

    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    try {
      // The learner's level page still renders — reordering broke nothing for them.
      const response = await learnerPage.goto(`/levels/${mine.levelNumber}`);
      expect(response?.status()).toBe(200);
      await expect(
        learnerPage.getByRole("heading", {
          name: `Level ${mine.levelNumber}`,
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
    } finally {
      await learner.close();
    }
  });
});
