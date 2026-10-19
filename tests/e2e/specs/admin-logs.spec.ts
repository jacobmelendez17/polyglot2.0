import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  getE2EAdminUserId,
  getE2EAuditEventsOf,
  getE2EUser,
  removeSeededAuditEvents,
  removeSeededUsers,
  seedAuditEvents,
  seedUser,
  setE2EAdminRole,
  type E2EUser,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";

/**
 * The audit log on React Admin (the Logs page's Audit tab — which stays: spec 27
 * keeps audits in Neon, and PostHog does not replace them), against the real
 * signed-in app and the isolated E2E database. The System tab beside it has its
 * own spec (`admin-system.spec.ts`).
 *
 * Every event this file needs is recorded through the real `recordAuditEvent`
 * (see `support/e2e-admin.ts`) under one `resourceType` the run invents, so it
 * finds, filters and removes exactly its own among whatever other specs left in
 * the trail. Roles other than admin flip the permanent E2E admin identity's
 * *database* role and restore it after every test.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const PAGE = "/admin/logs";
const API = "/api/v1/admin/logs";

const RUN = crypto.randomUUID().slice(0, 6);
/** The `resourceType` of every event this run records — and the first filter of every page it opens. */
const TAG = `u12-${RUN}`;
/** For the first visit to a route, which `next dev` compiles on demand (observed up to a minute). */
const SLOW = { timeout: 60_000 };

test.use({ storageState: ADMIN_AUTH });
test.describe.configure({ mode: "serial", timeout: 180_000 });

let createdUsers: string[] = [];

test.afterEach(async () => {
  await setE2EAdminRole("admin");
  // Events name their actor, so they go before the users who made them.
  await removeSeededAuditEvents(TAG);
  await removeSeededUsers(createdUsers);
  createdUsers = [];
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function person(
  options: Parameters<typeof seedUser>[0],
): Promise<E2EUser> {
  const made = await seedUser(options);
  createdUsers.push(made.id);
  return made;
}

/** What the log calls a person: display name, else username, else a short id — never a sign-in id. */
const nameOf = (user: Pick<E2EUser, "id" | "displayName" | "username">) =>
  user.displayName ?? user.username ?? `${user.id.slice(0, 8)}…`;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // Wait for animations that end (the details panel opening); a spinner or the
  // dev server's badge loops forever, and `finished` on one never settles.
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
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const table = (page: Page) => page.getByRole("table", { name: "Audit log" });
/** The events' own rows — React Admin keeps an (empty, collapsed) row under each for its details panel. */
const eventRows = (page: Page) =>
  table(page)
    .getByRole("row")
    .filter({ has: page.locator("time") });
const cellsOf = (row: Locator) => row.getByRole("cell");

async function listReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Logs", exact: true, level: 1 }),
  ).toBeVisible(SLOW);
  // Whatever the log ends up showing: the table, or one of its empty states.
  await expect(
    table(page)
      .or(page.getByText("No audit events match these filters"))
      .or(page.getByText("There is nothing more on this page"))
      .or(page.getByText("No audit events yet")),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function open(page: Page, query = `resourceType=${TAG}`) {
  await page.goto(`${PAGE}?${query}`);
  await listReady(page);
}

/** What one column shows, row by row, in the order the log shows them. */
async function column(page: Page, index: number): Promise<string[]> {
  const rows = eventRows(page);
  const texts: string[] = [];
  for (let row = 0; row < (await rows.count()); row++)
    texts.push((await cellsOf(rows.nth(row)).nth(index).innerText()).trim());
  return texts;
}
const WHEN = 0;
const ACTOR = 1;
const ACTION = 2;
const RESOURCE = 3;
const REASON = 4;

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

const showDetails = (page: Page, row = 0) =>
  eventRows(page).nth(row).getByRole("button", { name: "Show details" });

/** Three events at known, distinct times — newest last recorded — by three different people. */
async function threeEvents() {
  const ben = await person({ displayName: `${RUN} Ben` });
  const nameless = await person({ displayName: null, username: null });
  const adminId = await getE2EAdminUserId();
  const levelId = crypto.randomUUID();
  const ids = await seedAuditEvents([
    {
      actorUserId: ben.id,
      action: "LEVEL_UPDATED",
      resourceType: TAG,
      resourceId: levelId,
      reason: "Fixed a typo",
      beforeData: { name: "Old" },
      afterData: { name: "New" },
      correlationId: `corr-${RUN}`,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
    },
    {
      actorUserId: adminId,
      action: "GROUP_CREATED",
      resourceType: TAG,
      afterData: { name: "A group" },
      createdAt: new Date("2026-03-01T11:00:00.000Z"),
    },
    {
      actorUserId: nameless.id,
      action: "DECK_DELETED",
      resourceType: TAG,
      resourceId: "deck-without-a-uuid-shape",
      createdAt: new Date("2026-03-01T12:00:00.000Z"),
    },
  ]);
  return { ben, nameless, adminId, levelId, ids };
}

/* -------------------------------------------------------------------------- */
/* The log                                                                    */
/* -------------------------------------------------------------------------- */

test.describe("the log", () => {
  test("lists the events newest first — when, who, what, to what, why — as the database holds them", async ({
    page,
  }) => {
    const { ben, nameless, adminId, levelId } = await threeEvents();
    await open(page);

    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["When", "Actor", "Action", "Resource", "Reason", "Details"],
    );

    // The database's own order, from a query that is not the log's.
    const inDatabase = await getE2EAuditEventsOf(TAG);
    expect(inDatabase.map((event) => event.action)).toEqual([
      "DECK_DELETED",
      "GROUP_CREATED",
      "LEVEL_UPDATED",
    ]);
    expect(await column(page, ACTION)).toEqual(
      inDatabase.map((event) => event.action),
    );

    // Who: a name, never a sign-in id — and a short id for someone with no name.
    const admin = (await getE2EUser(adminId))!;
    expect(await column(page, ACTOR)).toEqual([
      nameOf(nameless),
      nameOf(admin),
      nameOf(ben),
    ]);
    expect(nameOf(nameless)).toBe(`${nameless.id.slice(0, 8)}…`);

    // To what: the type and the start of the id — and no id, when there is none.
    expect(await column(page, RESOURCE)).toEqual([
      `${TAG} · deck-wit…`,
      TAG,
      `${TAG} · ${levelId.slice(0, 8)}…`,
    ]);
    // Why.
    expect(await column(page, REASON)).toEqual(["—", "—", "Fixed a typo"]);

    // When: the exact instant, for assistive technology.
    const instants = await eventRows(page)
      .locator("time")
      .evaluateAll((times) =>
        times.map((time) => time.getAttribute("datetime")),
      );
    expect(instants).toEqual([
      "2026-03-01T12:00:00.000Z",
      "2026-03-01T11:00:00.000Z",
      "2026-03-01T10:00:00.000Z",
    ]);
    expect((await column(page, WHEN))[0]).toMatch(/2026/);
    await noHash(page);
    await shot(page, "logs-list-light");
  });

  test("opens an event's details — the whole of who, what and to what, and the recorded before and after — one at a time, from the keyboard too", async ({
    page,
  }) => {
    const { ben, levelId, ids } = await threeEvents();
    await open(page);

    // LEVEL_UPDATED is the oldest of the three, so it is the third row.
    await showDetails(page, 2).click();
    const panel = page.getByRole("group", { name: "Details of LEVEL_UPDATED" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`${nameOf(ben)} (${ben.id})`);
    await expect(panel).toContainText(`${TAG} · ${levelId}`);
    await expect(panel).toContainText("Fixed a typo");
    await expect(panel).toContainText(`corr-${RUN}`);
    await expect(panel).toContainText(ids[0]!);
    await expect(panel.getByRole("region", { name: "Before" })).toHaveText(
      JSON.stringify({ name: "Old" }, null, 2),
    );
    await expect(panel.getByRole("region", { name: "After" })).toHaveText(
      JSON.stringify({ name: "New" }, null, 2),
    );
    const hide = eventRows(page)
      .nth(2)
      .getByRole("button", { name: "Hide details" });
    await expect(hide).toHaveAttribute("aria-expanded", "true");
    await shot(page, "logs-details-light");

    // One at a time: opening another closes this one.
    await showDetails(page, 1).click();
    await expect(
      page.getByRole("group", { name: "Details of GROUP_CREATED" }),
    ).toBeVisible();
    await expect(panel).toHaveCount(0);
    // "Nothing was recorded before" is said, not left blank.
    await expect(
      page
        .getByRole("group", { name: "Details of GROUP_CREATED" })
        .getByRole("region", { name: "Before" }),
    ).toHaveText("null");

    // The keyboard reaches the button and presses it.
    await showDetails(page, 0).focus();
    await expect(showDetails(page, 0)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("group", { name: "Details of DECK_DELETED" }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("group", { name: "Details of DECK_DELETED" }),
    ).toHaveCount(0);
  });

  test("filters live in the address — they survive a reload, Back undoes them, typing replaces the history entry, and half an id is not a filter", async ({
    page,
  }) => {
    const { ben } = await threeEvents();
    await open(page);
    await expect(eventRows(page)).toHaveCount(3);
    const start = page.url();

    // Choosing an action opens a new view.
    await page.getByRole("combobox", { name: /Action/ }).click();
    await page
      .getByRole("option", { name: "GROUP_CREATED", exact: true })
      .click();
    await expect(page).toHaveURL(/action=GROUP_CREATED/);
    await expect(eventRows(page)).toHaveCount(1);
    expect(await column(page, ACTION)).toEqual(["GROUP_CREATED"]);

    // …and it survives a reload.
    await page.reload();
    await listReady(page);
    await expect(eventRows(page)).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: /Action/ })).toHaveText(
      "GROUP_CREATED",
    );

    // Half an actor id is not a filter yet: nothing is asked, nothing moves.
    const actor = page.getByRole("textbox", { name: "Actor ID" });
    await actor.fill(ben.id.slice(0, 13));
    // A negative cannot be waited *for*: outlast the form's 500 ms debounce.
    await page.waitForTimeout(900);
    await expect(page).not.toHaveURL(/actor=/);
    await expect(eventRows(page)).toHaveCount(1);

    // The whole id is — and typing replaces the history entry instead of
    // stacking one, so Back returns to *before the action filter*.
    await page.getByRole("combobox", { name: /Action/ }).click();
    await page.getByRole("option", { name: "Clear value" }).click();
    await expect(page).not.toHaveURL(/action=/);
    await actor.fill(ben.id);
    await expect(page).toHaveURL(new RegExp(`actor=${ben.id}`));
    await expect(eventRows(page)).toHaveCount(1);
    expect(await column(page, ACTION)).toEqual(["LEVEL_UPDATED"]);
    await page.goBack();
    await expect(page).toHaveURL(/action=GROUP_CREATED/);
    await page.goBack();
    expect(page.url()).toBe(start);
    await listReady(page);
    await expect(eventRows(page)).toHaveCount(3);

    // A date range is whole days, both ends included.
    await page.getByLabel("From date").fill("2026-03-02");
    await expect(page).toHaveURL(/from=2026-03-02/);
    await expect(
      page.getByText("No audit events match these filters"),
    ).toBeVisible();
    await shot(page, "logs-filtered-empty-light");
    await page.getByLabel("From date").fill("2026-03-01");
    await page.getByLabel("To date").fill("2026-03-01");
    await expect(eventRows(page)).toHaveCount(3);
    await page.getByLabel("To date").fill("2026-02-28");
    await expect(
      page.getByText("No audit events match these filters"),
    ).toBeVisible();
    await noHash(page);
  });

  test("pages 25 at a time without skipping an event — 27 recorded in one instant are 27 on screen — and a bad page link says so", async ({
    page,
  }) => {
    const labels = Array.from(
      { length: 27 },
      (_, index) => `event ${String(index + 1).padStart(2, "0")}`,
    );
    // No `createdAt`: all 27 share their transaction's one instant, to the
    // microsecond — the group a bulk publish writes, which the old cursor cut
    // wherever a page ended.
    await seedAuditEvents(
      labels.map((reason) => ({ resourceType: TAG, reason })),
    );
    expect(
      new Set((await getE2EAuditEventsOf(TAG)).map((e) => +e.createdAt)).size,
    ).toBe(1);
    await open(page);

    await expect(eventRows(page)).toHaveCount(25);
    await expect(
      page.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    const first = await column(page, REASON);
    await shot(page, "logs-page-1-light");

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(eventRows(page)).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    const second = await column(page, REASON);
    expect([...first, ...second].sort()).toEqual(labels);
    expect(new Set([...first, ...second]).size).toBe(27);

    // A deep link to page two is page two, after a reload too.
    const onPageTwo = page.url();
    await page.reload();
    await listReady(page);
    expect(await column(page, REASON)).toEqual(second);

    // Back by the server's cursor to the first page, which needs none.
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(eventRows(page)).toHaveCount(25);
    expect(new URL(page.url()).searchParams.has("cursor")).toBe(false);
    expect(await column(page, REASON)).toEqual(first);

    // The same through the endpoint, in pages of 7: nothing lost, nothing twice.
    await renewSession(page);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < 10; pages++) {
      const response: APIResponse = await page.request.get(
        `${API}?resourceType=${TAG}&limit=7${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(response.status()).toBe(200);
      const body: {
        data: { items: { id: string }[]; nextCursor: string | null };
      } = await response.json();
      seen.push(...body.data.items.map((row) => row.id));
      cursor = body.data.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(27);
    expect(new Set(seen)).toEqual(
      new Set((await getE2EAuditEventsOf(TAG)).map((event) => event.id)),
    );

    // A page link that is not one of ours is a plain-worded refusal, not a blank log.
    expect(
      (
        await page.request.get(`${API}?resourceType=${TAG}&cursor=garbage`)
      ).status(),
    ).toBe(422);
    await page.goto(`${onPageTwo.replace(/cursor=[^&]*/, "cursor=garbage")}`);
    // By its words: Next's own route announcer is an `alert` too.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "That page link is not valid." }),
    ).toContainText("Go back to the first page.");
  });
});

/* -------------------------------------------------------------------------- */
/* Who may use it                                                             */
/* -------------------------------------------------------------------------- */

test.describe("who may use it", () => {
  test("an Admin and a developer read the log; a writer, a learner and a visitor do not — and a writer is not offered the link", async ({
    page,
    browser,
  }) => {
    await threeEvents();
    const url = `${API}?resourceType=${TAG}`;
    const sidebar = page.getByRole("navigation", { name: "Admin" });

    for (const role of ["admin", "developer"] as const) {
      await setE2EAdminRole(role);
      await page.goto("/admin");
      await expect(sidebar.getByRole("link", { name: "Logs" })).toBeVisible();
      await open(page);
      await expect(eventRows(page)).toHaveCount(3);
      await renewSession(page);
      expect((await page.request.get(url)).status(), `${role}: the log`).toBe(
        200,
      );
      const me = await page.request.get("/api/v1/admin/me");
      expect(
        (await me.json()).data.permissions.resources.logs,
        `${role}: the effective permissions`,
      ).toEqual(["list"]);
    }

    // A writer authors curriculum, but does not read the trail of who changed what.
    await setE2EAdminRole("writer");
    expect((await page.goto(`${PAGE}?resourceType=${TAG}`))?.status()).toBe(
      403,
    );
    await renewSession(page);
    expect((await page.request.get(url)).status(), "writer: the log").toBe(403);
    expect((await page.goto("/admin"))?.status()).toBe(200);
    await expect(sidebar.getByRole("link", { name: "Logs" })).toHaveCount(0);
    const me = await page.request.get("/api/v1/admin/me");
    expect(
      Object.hasOwn((await me.json()).data.permissions.resources, "logs"),
    ).toBe(false);

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

  test("the endpoint is read-only, sends no sign-in id or email, refuses what it does not honour, and is never cached", async ({
    page,
  }) => {
    const { ben } = await threeEvents();
    await renewSession(page);
    const get = (query: string) => page.request.get(`${API}?${query}`);

    const ok = await get(`resourceType=${TAG}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("no-store");
    const text = await ok.text();
    const { data } = JSON.parse(text);
    expect(data.items).toHaveLength(3);
    // Exactly these fields, and no more.
    expect(Object.keys(data.items[0]).sort()).toEqual(
      [
        "action",
        "actorId",
        "actorName",
        "afterData",
        "beforeData",
        "correlationId",
        "createdAt",
        "id",
        "reason",
        "resourceId",
        "resourceType",
      ].sort(),
    );
    // Nobody's sign-in id: not the fixtures', not the Admin's own.
    expect(text).not.toContain("e2e-fixture-");
    const adminClerkId = process.env.E2E_ADMIN_CLERK_USER_ID;
    if (adminClerkId) expect(text).not.toContain(adminClerkId);
    expect(
      data.items.find((row: { actorId: string }) => row.actorId === ben.id)
        .actorName,
    ).toBe(nameOf(ben));

    for (const [name, query] of [
      ["an unknown parameter", "sort=action"],
      ["a language", "language=5b2eb57d-acb8-4964-8af4-49a417cf227a"],
      ["an action nothing records", "action=SOMETHING_ELSE"],
      ["an actor that is not an id", "actor=ada"],
      ["a day that does not exist", "to=2026-02-30"],
      ["a page over the bound", "limit=101"],
    ] as const)
      expect((await get(query)).status(), name).toBe(422);

    // There is no way to write to the log.
    const write = await page.request.post(API, {
      headers: { "content-type": "application/json" },
      data: {},
    });
    expect(write.status()).toBe(405);
  });
});

/* -------------------------------------------------------------------------- */
/* The page around it                                                         */
/* -------------------------------------------------------------------------- */

test.describe("the page", () => {
  test("keeps its two tabs — the System tab explains how telemetry is set up (its own spec covers it), and Audit brings the log back", async ({
    page,
  }) => {
    await threeEvents();
    await open(page);
    await expect(eventRows(page)).toHaveCount(3);

    await page.getByRole("tab", { name: "System" }).click();
    await expect(page).toHaveURL(/tab=system/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Telemetry on this server" }),
    ).toBeVisible();
    await expect(table(page)).toHaveCount(0);

    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page).toHaveURL(/tab=audit/);
    await listReady(page);
    await expect(table(page)).toBeVisible();

    // The old address, with the page's own `tab`, still reads as the same log.
    await page.goto(
      `${PAGE}?tab=audit&action=GROUP_CREATED&resourceType=${TAG}`,
    );
    await listReady(page);
    await expect(eventRows(page)).toHaveCount(1);
    await noHash(page);
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme", async ({ page }) => {
    await threeEvents();
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(eventRows(page)).toHaveCount(3);
    await showDetails(page, 2).click();
    await expect(
      page.getByRole("group", { name: "Details of LEVEL_UPDATED" }),
    ).toBeVisible();
    await shot(page, "logs-details-dark");
  });

  test("lays out at 390px without scrolling the page sideways — the table keeps when and what, and the details hold the rest", async ({
    page,
  }) => {
    await threeEvents();
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // The table keeps inside its own frame: nothing is scrolled out of sight in it.
    expect(
      await page.evaluate(() => {
        const frame = document.querySelector(
          ".RaDataTable-tableWrapper",
        ) as HTMLElement;
        return frame.scrollWidth - frame.clientWidth;
      }),
    ).toBeLessThanOrEqual(0);
    // When, what and the button remain; the actor, resource and reason give way.
    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["When", "Action", "Details"],
    );
    await expect(showDetails(page, 0)).toBeInViewport({ ratio: 1 });
    await shot(page, "logs-list-mobile");

    // What the table gave up is in the details, one tap away.
    await showDetails(page, 2).click();
    const panel = page.getByRole("group", { name: "Details of LEVEL_UPDATED" });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Fixed a typo");
    await expect(panel).toContainText(`${RUN} Ben`);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, "logs-details-mobile");
  });
});
