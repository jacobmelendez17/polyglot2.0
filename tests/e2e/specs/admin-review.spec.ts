import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import type { AdminReviewPage } from "@/domains/admin";

import {
  countE2EPublishAudits,
  getE2EAdminScope,
  getE2EItemState,
  publishBehindTheirBack,
  removeSeededItems,
  seedExtraVocabulary,
  seedItemWithDraft,
  seedOtherLanguage,
  seedPendingItem,
  setE2EAdminRole,
} from "../support/e2e-admin";
import { spendRateBudget } from "../support/rate-budget";
import { renewSession } from "../support/e2e-session";
import { ensureLearnerOnboarded } from "../support/e2e-state";

/**
 * Spec 26 Unit 3 — the Admin review queue, rendered through React Admin,
 * against the real signed-in app and the isolated E2E database.
 *
 * Every item this file needs is created through the real `createItem` /
 * `updateItem` services (see `support/e2e-admin.ts`) with a per-run name, and
 * removed again afterwards, so no other spec sees extra curriculum and this
 * one never depends on the seeded "amarillo" fixture that `admin-publication`
 * consumes. Roles other than admin flip the permanent E2E admin identity's
 * *database* role and restore it after every test.
 *
 * Publishing is rate limited (10 requests / 60s per Admin — a real control,
 * `providers/rate-limit/policies.ts`, never relaxed for tests). This file
 * spends from that budget on purpose, through the account it shares with the
 * other specs that publish (`support/rate-budget.ts`), and waits out the window
 * rather than tripping it.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PAGE_SIZE = 20;
const QUEUE_API = "/api/v1/admin/review";
const PUBLISH_API = "/api/v1/admin/review/publish";

/** Distinguishes this run's items from anything a crashed earlier run left behind. */
const RUN = crypto.randomUUID().slice(0, 6);
const named = (name: string) => `zzr${RUN}${name}`;

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial" });

let languageId = "";
/** Items created by the running test; removed after it, so the queue stays small. */
let created: string[] = [];

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
});

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  await removeSeededItems(created);
  created = [];
});

/* -------------------------------------------------------------------------- */
/* Fixtures and page helpers                                                  */
/* -------------------------------------------------------------------------- */

type Seeded = { id: string; label: string };

async function newItem(name: string, meaning?: string): Promise<Seeded> {
  const label = named(name);
  const id = await seedPendingItem(label, meaning ?? `meaning of ${name}`);
  created.push(id);
  return { id, label };
}

async function editedItem(name: string, draftMeaning: string) {
  const label = named(name);
  const { id, liveMeaning } = await seedItemWithDraft(label, draftMeaning);
  created.push(id);
  return { id, label, liveMeaning, draftMeaning };
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // A dialog fades in; a picture taken mid-fade shows nothing useful.
  const container = page.locator(".MuiDialog-container");
  if ((await container.count()) > 0)
    await expect(container).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const queue = (page: Page) => page.getByRole("table", { name: "Review queue" });
const rowOf = (page: Page, label: string) =>
  queue(page).getByRole("row").filter({ hasText: label });

/** The item names on screen, in order. */
const labels = (page: Page) => queue(page).getByRole("link").allInnerTexts();

const reviewUrl = (search = "") =>
  `/admin/curriculum/review?language=${languageId}${search}`;

async function queueReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await expect(queue(page)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

/**
 * The screen has finished loading, whether or not anything is waiting: a table
 * when there are rows, "Nothing is waiting" when there are none.
 */
async function queueSettled(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(
    queue(page).or(page.getByText("Nothing is waiting")),
  ).toBeVisible();
}

async function openQueue(page: Page, search = ""): Promise<void> {
  await page.goto(reviewUrl(search));
  await queueReady(page);
}

async function openPublishDialog(page: Page, label: string): Promise<Locator> {
  await rowOf(page, label)
    .getByRole("button", { name: `Publish ${label}` })
    .click();
  const dialog = page.getByRole("dialog", { name: `Publish “${label}”?` });
  await expect(dialog).toBeVisible();
  return dialog;
}

const confirm = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Publish", exact: true });

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

/** Whether keyboard focus is inside the open dialog, whichever wrapper element holds it. */
const focusIsInDialog = (page: Page) =>
  page.evaluate(() =>
    Boolean(document.activeElement?.closest(".MuiDialog-root")),
  );

/**
 * The queue as the API reports it — what the screen must agree with.
 *
 * `renew` signs the request in afresh, which *navigates the page away*; pass
 * `false` mid-test, when an app page is already open and keeping its own
 * session fresh.
 */
async function queueFromApi(
  page: Page,
  query = `language=${languageId}&limit=100`,
  { renew = true }: { renew?: boolean } = {},
): Promise<AdminReviewPage> {
  if (renew) await renewSession(page);
  const response = await page.request.get(`${QUEUE_API}?${query}`);
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}

/** The headers a real page from this app attaches to a same-origin `fetch`. */
function fromThisApp(origin: string, contentType = "application/json") {
  return {
    origin,
    "sec-fetch-site": "same-origin",
    "content-type": contentType,
  };
}

const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin;

const command = (
  item: { id: string },
  version = 1,
  key = crypto.randomUUID(),
) => ({
  itemId: item.id,
  expectedVersion: version,
  idempotencyKey: key,
});

/* -------------------------------------------------------------------------- */
/* What the queue shows                                                       */
/* -------------------------------------------------------------------------- */

test.describe("the queue", () => {
  test("shows a new item and an edit to a published one, each as what it is", async ({
    page,
  }) => {
    const fresh = await newItem("new", "a brand new thing");
    const edit = await editedItem("edit", "an edited thing");

    await openQueue(page);

    const headers = await queue(page).getByRole("columnheader").allInnerTexts();
    expect(headers.slice(0, 7)).toEqual([
      "Item",
      "Meaning",
      "Level",
      "Group",
      "Status",
      "Edited by",
      "Updated",
    ]);

    const newRow = rowOf(page, fresh.label);
    await expect(newRow).toContainText("Pending");
    await expect(newRow).toContainText("New item");
    await expect(newRow).toContainText("a brand new thing");
    // A new item has no draft author.
    await expect(newRow.getByRole("cell").nth(5)).toHaveText("—");

    const editRow = rowOf(page, edit.label);
    await expect(editRow).toContainText("Draft");
    await expect(editRow).toContainText("Edit to a published item");
    // The row shows what is live now, not the unpublished wording.
    await expect(editRow).toContainText(edit.liveMeaning);
    await expect(editRow).not.toContainText("an edited thing");
    const author = editRow.getByRole("cell").nth(5);
    await expect(author).toHaveText(/\S/);
    await expect(author).not.toHaveText("—");

    // Both rows say when, in a form a machine can read.
    for (const row of [newRow, editRow]) {
      const stamp = await row.locator("time").getAttribute("datetime");
      expect(Number.isNaN(Date.parse(stamp ?? ""))).toBe(false);
    }

    // The database agrees about which is which.
    expect(await getE2EItemState(fresh.id)).toMatchObject({
      status: "pending",
      hasDraft: false,
      version: 1,
    });
    expect(await getE2EItemState(edit.id)).toMatchObject({
      status: "published",
      hasDraft: true,
      primaryMeaning: edit.liveMeaning,
    });
    await shot(page, "review-queue-light");
  });

  test("links each item to its own editor", async ({ page }) => {
    const item = await newItem("link");
    await openQueue(page);

    await queue(page).getByRole("link", { name: item.label }).click();

    await expect(page).toHaveURL(
      new RegExp(`/admin/curriculum/items/${item.id}`),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Publishing                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("publishing", () => {
  test("asks first, says what will happen, and Cancel changes nothing", async ({
    page,
  }) => {
    const item = await newItem("ask");
    await openQueue(page);

    const dialog = await openPublishDialog(page, item.label);
    await expect(dialog).toContainText(
      "This item will become visible to learners for the first time.",
    );
    await expect(dialog).toContainText(item.label);
    await shot(page, "review-dialog-light");

    // Opening the dialog changed nothing.
    expect(await getE2EItemState(item.id)).toMatchObject({
      status: "pending",
      version: 1,
    });

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    expect(await getE2EItemState(item.id)).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await countE2EPublishAudits(item.id)).toBe(0);
    await expect(rowOf(page, item.label)).toBeVisible();
  });

  test("confirming publishes once, announces it, and the row leaves the queue", async ({
    page,
  }) => {
    await spendRateBudget("admin-publish");
    const item = await newItem("once");
    await openQueue(page);

    const dialog = await openPublishDialog(page, item.label);
    await confirm(dialog).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(`Published “${item.label}”`)).toBeVisible();
    await expect(rowOf(page, item.label)).toHaveCount(0);

    expect(await getE2EItemState(item.id)).toMatchObject({
      status: "published",
      version: 2,
      hasDraft: false,
    });
    expect(await countE2EPublishAudits(item.id)).toBe(1);

    // A refresh agrees: it is not coming back. (If it was the only thing
    // waiting, the queue is now empty and says so.)
    await page.reload();
    await queueSettled(page);
    await expect(rowOf(page, item.label)).toHaveCount(0);
  });

  test("an edit changes what learners see only when it is published", async ({
    page,
    browser,
  }) => {
    await spendRateBudget("admin-publish");
    await ensureLearnerOnboarded();
    const edit = await editedItem("live", "the edited wording");

    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    try {
      // Saving the edit published nothing: learners still see the live wording.
      await learnerPage.goto(`/items/${edit.id}`);
      await expect(
        learnerPage.getByText(edit.liveMeaning).first(),
      ).toBeVisible();
      await expect(learnerPage.getByText("the edited wording")).toHaveCount(0);

      await openQueue(page);
      const dialog = await openPublishDialog(page, edit.label);
      await expect(dialog).toContainText(
        "This will replace the currently live content with the edited version.",
      );
      await expect(dialog).toContainText(
        "Existing learner progress stays attached",
      );
      await confirm(dialog).click();
      await expect(dialog).toHaveCount(0);

      expect(await getE2EItemState(edit.id)).toMatchObject({
        status: "published",
        version: 2,
        hasDraft: false,
        primaryMeaning: edit.draftMeaning,
      });
      expect(await countE2EPublishAudits(edit.id)).toBe(1);

      await learnerPage.reload();
      await expect(
        learnerPage.getByText("the edited wording").first(),
      ).toBeVisible();
    } finally {
      await learner.close();
    }
  });

  test("is operable by keyboard alone: focus moves in, Escape returns it, Enter publishes", async ({
    page,
  }) => {
    await spendRateBudget("admin-publish");
    const item = await newItem("kbd");
    await openQueue(page);

    const opener = rowOf(page, item.label).getByRole("button", {
      name: `Publish ${item.label}`,
    });
    const dialog = page.getByRole("dialog", {
      name: `Publish “${item.label}”?`,
    });

    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    // Focus moved into the dialog: the page behind it is no longer reachable.
    await expect.poll(() => focusIsInDialog(page)).toBe(true);

    // Escape backs out, and puts focus back on the button that opened it.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await getE2EItemState(item.id)).toMatchObject({ status: "pending" });

    // Open it again and confirm without a pointer.
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await confirm(dialog).focus();
    await page.keyboard.press("Enter");

    await expect(dialog).toHaveCount(0);
    expect(await getE2EItemState(item.id)).toMatchObject({
      status: "published",
      version: 2,
    });
    expect(await countE2EPublishAudits(item.id)).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Stale versions and races                                                   */
/* -------------------------------------------------------------------------- */

test.describe("stale versions and races", () => {
  test("a version that went stale offers Reload, publishes nothing, and Reload clears it", async ({
    page,
  }) => {
    await spendRateBudget("admin-publish");
    const item = await newItem("stale");
    await openQueue(page);
    await expect(rowOf(page, item.label)).toBeVisible();

    // Somebody else publishes it while this page still shows it as waiting.
    await publishBehindTheirBack(item.id, 1);
    expect(await getE2EItemState(item.id)).toMatchObject({ version: 2 });

    const dialog = await openPublishDialog(page, item.label);
    await confirm(dialog).click();

    await expect(dialog).toContainText(/changed after you opened it/i);
    await expect(dialog.getByRole("button", { name: "Reload" })).toBeVisible();
    // Never a blind retry of an outdated view.
    await expect(
      dialog.getByRole("button", { name: /^(Publish|Try again)$/ }),
    ).toHaveCount(0);
    await shot(page, "review-dialog-stale");

    // Only the other Admin's publication happened.
    expect(await countE2EPublishAudits(item.id)).toBe(1);
    expect(await getE2EItemState(item.id)).toMatchObject({ version: 2 });

    await dialog.getByRole("button", { name: "Reload" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, item.label)).toHaveCount(0);
  });

  test("two Admins confirming at the same moment publish it once", async ({
    browser,
  }) => {
    await spendRateBudget("admin-publish", 2);
    const item = await newItem("race");

    const open = async (): Promise<{ page: Page; dialog: Locator }> => {
      const context = await browser.newContext({ storageState: ADMIN_AUTH });
      const page = await context.newPage();
      await openQueue(page);
      return { page, dialog: await openPublishDialog(page, item.label) };
    };
    const [a, b] = await Promise.all([open(), open()]);

    try {
      await Promise.all([confirm(a.dialog).click(), confirm(b.dialog).click()]);

      const settle = async ({ dialog }: { dialog: Locator }) => {
        await expect
          .poll(
            async () =>
              (await dialog.count()) === 0 ||
              (await dialog.getByRole("button", { name: "Reload" }).count()) >
                0,
          )
          .toBe(true);
        return (await dialog.count()) === 0 ? "published" : "stale";
      };
      const outcomes = await Promise.all([settle(a), settle(b)]);

      expect([...outcomes].sort()).toEqual(["published", "stale"]);
      expect(await countE2EPublishAudits(item.id)).toBe(1);
      expect(await getE2EItemState(item.id)).toMatchObject({
        status: "published",
        version: 2,
      });
    } finally {
      await a.page.context().close();
      await b.page.context().close();
    }
  });

  test("a replay is answered from the stored result, and a reused key for another item is refused", async ({
    page,
    baseURL,
  }) => {
    await spendRateBudget("admin-publish", 3);
    const item = await newItem("replay");
    const other = await newItem("replayother");
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const key = crypto.randomUUID();

    const first = await page.request.post(PUBLISH_API, {
      headers,
      data: command(item, 1, key),
    });
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ data: { itemId: item.id } });
    expect(first.headers()["cache-control"]).toContain("no-store");

    // The same intent again — as a retry after a lost response would send it.
    const replay = await page.request.post(PUBLISH_API, {
      headers,
      data: command(item, 1, key),
    });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toEqual({ data: { itemId: item.id } });
    expect(await countE2EPublishAudits(item.id)).toBe(1);
    expect(await getE2EItemState(item.id)).toMatchObject({ version: 2 });

    // The same key for a *different* item is a different request: refused.
    const reused = await page.request.post(PUBLISH_API, {
      headers,
      data: command(other, 1, key),
    });
    expect(reused.status()).toBe(409);
    expect(await getE2EItemState(other.id)).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await countE2EPublishAudits(other.id)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* What the command refuses                                                   */
/* -------------------------------------------------------------------------- */

test.describe("what the command refuses", () => {
  let target: Seeded;

  test.beforeAll(async () => {
    target = {
      id: await seedPendingItem(named("target"), "meaning of target"),
      label: named("target"),
    };
  });
  test.afterAll(async () => {
    await removeSeededItems([target.id]);
  });

  const untouched = async () => {
    expect(await getE2EItemState(target.id)).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await countE2EPublishAudits(target.id)).toBe(0);
  };

  const errorCode = async (response: APIResponse) =>
    (await response.json()).error?.code;

  test("a cross-site page cannot publish as a signed-in Admin", async ({
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
        {
          ...fromThisApp(originOf(baseURL)),
          "sec-fetch-site": "same-site",
        },
      ],
      [
        "a wrong Origin alone",
        { origin: "https://evil.example", "content-type": "application/json" },
      ],
      ["no origin information at all", { "content-type": "application/json" }],
    ];
    for (const [name, headers] of attempts) {
      const response = await page.request.post(PUBLISH_API, {
        headers,
        data: command(target),
      });
      expect(response.status(), name).toBe(403);
      expect(await response.json(), name).not.toHaveProperty("data");
    }
    await untouched();
  });

  test("only JSON is accepted — what a cross-site <form> can send is not", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const response = await page.request.post(PUBLISH_API, {
        headers: fromThisApp(originOf(baseURL), type),
        data: JSON.stringify(command(target)),
      });
      expect(response.status(), type).toBe(415);
    }
    await untouched();
  });

  test("the command is never accepted in the query string", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const body = command(target);
    const response = await page.request.post(
      `${PUBLISH_API}?itemId=${body.itemId}&expectedVersion=1&idempotencyKey=${body.idempotencyKey}`,
      { headers: fromThisApp(originOf(baseURL)), data: body },
    );
    expect(response.status()).toBe(422);
    await untouched();
  });

  test("malformed, oversized, and over-eager bodies are refused outright", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const good = command(target);
    const refused: [string, number, string][] = [
      ["invalid JSON", 422, "{not json"],
      ["an empty body", 422, ""],
      ["an array", 422, "[]"],
      [
        "a non-UUID item",
        422,
        JSON.stringify({ ...good, itemId: "1; drop table" }),
      ],
      [
        "a non-UUID key",
        422,
        JSON.stringify({ ...good, idempotencyKey: "retry-1" }),
      ],
      [
        "a version of zero",
        422,
        JSON.stringify({ ...good, expectedVersion: 0 }),
      ],
      [
        "a string version",
        422,
        JSON.stringify({ ...good, expectedVersion: "1" }),
      ],
      // The actor is whoever is signed in — never whoever the body names.
      [
        "an actor in the body",
        422,
        JSON.stringify({ ...good, actorUserId: crypto.randomUUID() }),
      ],
      [
        "a bulk-publish flag",
        422,
        JSON.stringify({ ...good, publishAll: true }),
      ],
      [
        "an oversized body",
        413,
        JSON.stringify({ ...good, padding: "x".repeat(10_000) }),
      ],
    ];
    for (const [name, status, data] of refused) {
      const response = await page.request.post(PUBLISH_API, { headers, data });
      expect(response.status(), name).toBe(status);
    }
    await untouched();
  });

  test("an anonymous caller gets 401 and a learner 403, from both endpoints", async ({
    browser,
    baseURL,
  }) => {
    const headers = fromThisApp(originOf(baseURL));

    const visitor = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    expect(
      (
        await visitor.request.post(PUBLISH_API, {
          headers,
          data: command(target),
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await visitor.request.get(`${QUEUE_API}?language=${languageId}`)
      ).status(),
    ).toBe(401);
    await visitor.close();

    const learner = await browser.newContext({ storageState: LEARNER_AUTH });
    const learnerPage = await learner.newPage();
    await renewSession(learnerPage);
    expect(
      (
        await learnerPage.request.post(PUBLISH_API, {
          headers,
          data: command(target),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await learnerPage.request.get(`${QUEUE_API}?language=${languageId}`)
      ).status(),
    ).toBe(403);
    await learner.close();
    await untouched();
  });

  test("each endpoint answers only its own method", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    expect((await page.request.get(PUBLISH_API)).status()).toBe(405);
    expect(
      (
        await page.request.post(QUEUE_API, {
          headers: fromThisApp(originOf(baseURL)),
          data: {},
        })
      ).status(),
    ).toBe(405);
    await untouched();
  });

  test("the queue endpoint refuses what it does not understand", async ({
    page,
  }) => {
    await renewSession(page);
    const get = (query: string) => page.request.get(`${QUEUE_API}?${query}`);

    expect((await get(`language=${languageId}&sort=name`)).status()).toBe(422);
    expect((await get(`language=${languageId}&page=2`)).status()).toBe(422);
    expect((await get(`language=${languageId}&limit=101`)).status()).toBe(422);
    expect((await get(`language=${languageId}&cursor=tampered`)).status()).toBe(
      422,
    );
    expect((await get("limit=5")).status()).toBe(422);
    const unknown = await get(`language=${crypto.randomUUID()}`);
    expect(unknown.status()).toBe(404);
    expect(await errorCode(unknown)).toBeTruthy();
  });

  test("privileged responses are never cached", async ({ page }) => {
    await renewSession(page);
    const response = await page.request.get(
      `${QUEUE_API}?language=${languageId}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
});

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("roles", () => {
  test("a writer sees the whole queue, with no way to publish — and is refused if they try", async ({
    page,
    baseURL,
  }) => {
    const item = await newItem("writer");
    await setE2EAdminRole("writer");

    await openQueue(page);
    await expect(rowOf(page, item.label)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
    await expect(
      page.getByText(
        "You can see everything waiting here. An Admin publishes it.",
      ),
    ).toBeVisible();
    await shot(page, "review-queue-writer");

    // Reading is allowed; the command is not — whatever the page did or didn't draw.
    const read = await page.request.get(`${QUEUE_API}?language=${languageId}`);
    expect(read.status()).toBe(200);
    const write = await page.request.post(PUBLISH_API, {
      headers: fromThisApp(originOf(baseURL)),
      data: command(item),
    });
    expect(write.status()).toBe(403);
    expect(await getE2EItemState(item.id)).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await countE2EPublishAudits(item.id)).toBe(0);
  });

  test("a developer is turned away from the page and both endpoints", async ({
    page,
    baseURL,
  }) => {
    const item = await newItem("developer");
    await setE2EAdminRole("developer");

    const response = await page.goto(reviewUrl());
    expect(response?.status()).toBe(403);
    await expect(queue(page)).toHaveCount(0);
    await page.waitForFunction(() =>
      Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    );

    expect(
      (await page.request.get(`${QUEUE_API}?language=${languageId}`)).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(PUBLISH_API, {
          headers: fromThisApp(originOf(baseURL)),
          data: command(item),
        })
      ).status(),
    ).toBe(403);
    expect(await getE2EItemState(item.id)).toMatchObject({ status: "pending" });
  });

  test("a role revoked while the confirmation is open is refused by the server", async ({
    page,
  }) => {
    const item = await newItem("revoked");
    await openQueue(page);
    const dialog = await openPublishDialog(page, item.label);

    // The page still believes this person is an Admin; the database no longer does.
    await setE2EAdminRole("writer");
    await confirm(dialog).click();

    await expect(dialog).toContainText(
      "You don't have access to this part of the admin console.",
    );
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^(Publish|Try again|Reload)$/ }),
    ).toHaveCount(0);

    expect(await getE2EItemState(item.id)).toMatchObject({
      status: "pending",
      version: 1,
    });
    expect(await countE2EPublishAudits(item.id)).toBe(0);
  });

  test("a role revoked while the queue is open takes the Publish buttons away on refocus", async ({
    page,
  }) => {
    const item = await newItem("downgrade");
    await openQueue(page);
    await expect(
      rowOf(page, item.label).getByRole("button", {
        name: `Publish ${item.label}`,
      }),
    ).toBeVisible();

    await setE2EAdminRole("writer");
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    });

    await expect(page.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
    // They can still read the queue.
    await expect(rowOf(page, item.label)).toBeVisible();
  });

  test("a role revoked entirely replaces the rows with access-denied", async ({
    page,
  }) => {
    const item = await newItem("gone");
    await openQueue(page);
    await expect(rowOf(page, item.label)).toBeVisible();

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
    await expect(queue(page)).toHaveCount(0);
    await shot(page, "review-queue-revoked");
  });
});

/* -------------------------------------------------------------------------- */
/* Paging                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("paging", () => {
  const TERMS = Array.from({ length: 22 }, (_, index) =>
    named(`pg${String(index + 1).padStart(2, "0")}`),
  );
  let ids: string[] = [];

  test.beforeAll(async () => {
    ids = await seedExtraVocabulary(TERMS, "waiting", "pending");
  });
  test.afterAll(async () => {
    await removeSeededItems(ids);
  });

  test("walks the queue by the server's cursors, with no gaps or duplicates", async ({
    page,
  }) => {
    const everything = (await queueFromApi(page)).items.map(
      (row) => row.itemLabel,
    );
    expect(everything.length).toBeGreaterThan(PAGE_SIZE);

    await openQueue(page);
    const first = await labels(page);
    expect(first).toHaveLength(PAGE_SIZE);
    expect(first).toEqual(everything.slice(0, PAGE_SIZE));
    // The first page has no Previous.
    await expect(
      page.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect.poll(() => labels(page)).toEqual(everything.slice(PAGE_SIZE));
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    await noHash(page);
    expect(new Set([...first, ...everything.slice(PAGE_SIZE)]).size).toBe(
      everything.length,
    );
    await shot(page, "review-queue-page-two");
  });

  test("Back, Previous, a deep link, and a refresh all land on the right page", async ({
    page,
  }) => {
    const everything = (await queueFromApi(page)).items.map(
      (row) => row.itemLabel,
    );
    const pageOne = everything.slice(0, PAGE_SIZE);
    const pageTwo = everything.slice(PAGE_SIZE);

    await openQueue(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect.poll(() => labels(page)).toEqual(pageTwo);
    const deepLink = page.url();

    // A refresh and a cold open of the same address are the same page.
    await page.reload();
    await queueReady(page);
    expect(await labels(page)).toEqual(pageTwo);
    await page.goto("/");
    await page.goto(deepLink);
    await queueReady(page);
    expect(await labels(page)).toEqual(pageTwo);

    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page).not.toHaveURL(/cursor=/);
    await expect.poll(() => labels(page)).toEqual(pageOne);

    await page.goBack();
    await expect.poll(() => labels(page)).toEqual(pageTwo);
    await noHash(page);
  });

  test("a queue that shrinks while you are on page two does not lose your place", async ({
    page,
  }) => {
    const before = await queueFromApi(page);
    const mine = before.items
      .slice(0, PAGE_SIZE)
      .filter((row) => row.itemLabel.startsWith(named("pg")));
    expect(mine.length).toBeGreaterThanOrEqual(3);

    // What page two holds, from the API — never read off the screen mid-fetch,
    // where the previous page's rows stay up until the next page arrives.
    const pageTwo = before.items.slice(PAGE_SIZE).map((row) => row.itemLabel);
    expect(pageTwo.length).toBeGreaterThan(0);

    await openQueue(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect.poll(() => labels(page)).toEqual(pageTwo);
    const deepLink = page.url();

    // Three rows before the cursor are published elsewhere. The cursor names
    // the *value* the page started after, not a position, so page two is
    // exactly what it was.
    for (const row of mine.slice(0, 3)) {
      await publishBehindTheirBack(row.id, row.version);
    }
    await page.goto(deepLink);
    await queueReady(page);
    expect(await labels(page)).toEqual(pageTwo);

    // Previous now reaches a first page that has closed up around the gap.
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(page).not.toHaveURL(/cursor=/);
    const now = (await queueFromApi(page, undefined, { renew: false })).items;
    await expect
      .poll(() => labels(page))
      .toEqual(now.slice(0, PAGE_SIZE).map((row) => row.itemLabel));
  });
});

/* -------------------------------------------------------------------------- */
/* Language scoping                                                           */
/* -------------------------------------------------------------------------- */

test.describe("language", () => {
  test("never mixes languages, and switching starts from the first page", async ({
    page,
  }) => {
    const item = await newItem("lang");
    const other = await seedOtherLanguage(named("other"));
    try {
      // The API: another language's queue holds none of this language's work.
      const theirs = await queueFromApi(page, `language=${other.languageId}`);
      expect(theirs.items.map((row) => row.id)).not.toContain(item.id);

      await page.goto(`/admin/curriculum/review?language=${other.languageId}`);
      await expect(page.getByText("Nothing is waiting")).toBeVisible();
      await expect(page.getByText(item.label)).toHaveCount(0);

      // Two languages: the switch appears, and returning shows this language's work.
      await page.getByRole("combobox", { name: /Language/ }).click();
      await page
        .getByRole("option")
        .filter({ hasNotText: "E2E Other" })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`language=${languageId}`));
      await expect(page).not.toHaveURL(/cursor=/);
      await expect(rowOf(page, item.label)).toBeVisible();
      await noHash(page);
    } finally {
      await other.remove();
    }
  });

  test("an unknown language in the address falls back instead of erroring", async ({
    page,
  }) => {
    const item = await newItem("fallback");
    await page.goto("/admin/curriculum/review?language=not-a-language");
    await queueReady(page);
    await expect(rowOf(page, item.label)).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables", async ({
    page,
  }) => {
    const item = await newItem("dark");
    await page.emulateMedia({ colorScheme: "dark" });
    await openQueue(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    const dialog = await openPublishDialog(page, item.label);

    // MUI paints from a palette built out of the live CSS variables; if it did
    // not follow Polyglot's dark mode it would show Material's own default.
    const painted = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const colorOf = (
        property: "color" | "backgroundColor",
        token: string,
      ) => {
        probe.style[property] = `var(${token})`;
        return getComputedStyle(probe)[property];
      };
      const paper = document.querySelector('[role="dialog"]') as HTMLElement;
      const title = document.querySelector(
        "#review-publish-title",
      ) as HTMLElement;
      const result = {
        paper: getComputedStyle(paper).backgroundColor,
        expectedPaper: colorOf("backgroundColor", "--bg-surface"),
        title: getComputedStyle(title).color,
        expectedTitle: colorOf("color", "--text-primary"),
      };
      probe.remove();
      return result;
    });
    expect(painted.paper).toBe(painted.expectedPaper);
    expect(painted.title).toBe(painted.expectedTitle);
    await expect(dialog).toBeVisible();
    await shot(page, "review-dialog-dark");
  });

  test("lays out at 390px without scrolling the page sideways, dialog included", async ({
    page,
  }) => {
    const item = await newItem("narrow");
    await page.setViewportSize({ width: 390, height: 844 });
    await openQueue(page);

    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);
    // The table may scroll sideways inside its own frame, but the one thing
    // this screen is for must not be scrolled out of reach.
    await expect(
      rowOf(page, item.label).getByRole("button", {
        name: `Publish ${item.label}`,
      }),
    ).toBeInViewport({ ratio: 1 });
    await shot(page, "review-queue-mobile");

    const dialog = await openPublishDialog(page, item.label);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shot(page, "review-dialog-mobile");
  });
});
