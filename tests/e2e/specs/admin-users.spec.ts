import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";

import { USER_LIST_PAGE_SIZE } from "@/domains/admin";
import type { UserRole } from "@/domains/users";

import {
  getE2EAdminUserId,
  getE2ERoleAudits,
  getE2EUser,
  getE2EUserFootprint,
  getE2EUsersTagged,
  getE2EVersionToken,
  removeRoleAudits,
  removeSeededUsers,
  renameE2EUser,
  seedManyUsers,
  seedUser,
  setE2EAdminRole,
  setE2EUserRole,
  type E2EUser,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";
import { ensureLearnerOnboarded, getLearnerId } from "../support/e2e-state";
import {
  markRateLimitExhausted,
  spendRateBudget,
} from "../support/rate-budget";

/**
 * Spec 26 Unit 6 — the Users & Roles console (`/admin/users`), against the real
 * signed-in app and the isolated E2E database: an Admin finds an account and
 * changes its one role, safely.
 *
 * The accounts it acts on are throwaway rows (`seedUser`) with a *fake* sign-in
 * id — they can be listed and given a role, but nobody can sign in as them. The
 * one proof that needs a real identity — "a role change takes effect on the
 * person's very next request" — uses the permanent E2E learner, promoted and
 * demoted through the screen, and restored to Learner after every test.
 *
 * Both limits this screen is under are real controls, never relaxed: reading
 * the account list is 30 / 60s (`admin-user-search`) and a role change is
 * 10 / 60s (`admin-role-change`). The spec spends from them through the shared
 * account in `support/rate-budget.ts` and waits out the window rather than
 * tripping it — except the two tests at the end, which trip each on purpose to
 * see the real 429 and then mark the budget exhausted.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const USERS_API = "/api/v1/admin/users";
const USERS_PAGE = "/admin/users";
const ROLE_PATH = /^\/api\/v1\/admin\/users\/[^/]+\/role$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The words an Admin reads. Written here, not imported, so a rename in the app cannot make this test agree with itself. */
const ROLE_NAME: Record<UserRole, string> = {
  user: "Learner",
  "beta-tester": "Beta tester",
  writer: "Writer",
  developer: "Developer",
  admin: "Admin",
};

const RUN = crypto.randomUUID().slice(0, 6);

test.use({ storageState: ADMIN_AUTH });
// Waiting out a rate-limit window can take a minute; a cold `next dev` compile
// of this route can take another.
test.describe.configure({ mode: "serial", timeout: 240_000 });

let adminId = "";
let learnerId = "";
/** Accounts created by the running test. Removed after it, with the audit events that name them. */
let created: string[] = [];

/**
 * What a test said it would spend, and what its page actually sent. A page that
 * reads the list or changes a role more often than the test budgeted would eat
 * into the *next* test's allowance, so it fails here instead of flaking there.
 */
type Tally = { reads: number; changes: number };
let budgeted: Tally = { reads: 0, changes: 0 };
let observed: Tally = { reads: 0, changes: 0 };
let countResponse: ((response: Response) => void) | undefined;

test.beforeAll(async () => {
  adminId = await getE2EAdminUserId();
  learnerId = await getLearnerId();
});

test.beforeEach(({ page }) => {
  budgeted = { reads: 0, changes: 0 };
  observed = { reads: 0, changes: 0 };
  countResponse = (response) => {
    const { pathname } = new URL(response.url());
    const method = response.request().method();
    if (method === "GET" && pathname === USERS_API) observed.reads++;
    if (method === "PATCH" && ROLE_PATH.test(pathname)) observed.changes++;
  };
  page.on("response", countResponse);
});

test.afterEach(async ({ page }, testInfo) => {
  if (countResponse) page.off("response", countResponse);
  // The permanent identities go back to exactly what they were...
  await setE2EAdminRole("admin");
  await setE2EUserRole(learnerId, "user");
  await removeRoleAudits([learnerId]);
  // ...and the throwaway accounts go, with the audit events that name them.
  await removeSeededUsers(created);
  created = [];
  if (testInfo.status === testInfo.expectedStatus) {
    expect(
      observed.reads,
      "the page read the account list more often than this test budgeted",
    ).toBeLessThanOrEqual(budgeted.reads);
    expect(
      observed.changes,
      "the page sent more role changes than this test budgeted",
    ).toBeLessThanOrEqual(budgeted.changes);
  }
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function reads(count: number): Promise<void> {
  budgeted.reads += count;
  await spendRateBudget("admin-user-search", count);
}

async function changes(count: number): Promise<void> {
  budgeted.changes += count;
  await spendRateBudget("admin-role-change", count);
}

async function person(
  options: Parameters<typeof seedUser>[0] = {},
): Promise<E2EUser> {
  const made = await seedUser(options);
  created.push(made.id);
  return made;
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  // A select's menu fades out after a choice, a dialog fades in, and the menu
  // sheet slides in; a picture taken part-way shows a ghost. Wait for every
  // animation that ends (some, like a spinner, never do).
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.effect?.getComputedTiming().iterations !== Infinity,
      );
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

type Named = Pick<E2EUser, "displayName">;
const nameOf = (who: Named): string => {
  expect(who.displayName, "this account needs a name to be found by").not.toBe(
    null,
  );
  return who.displayName!;
};

const table = (page: Page) => page.getByRole("table", { name: "Users" });
// `has` is evaluated inside each row, so its locator must start at the page —
// one chained from the table would look for a table inside a row.
const rowOf = (page: Page, who: Named) =>
  table(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: nameOf(who), exact: true }),
    });
const changeButton = (page: Page, who: Named) =>
  page.getByRole("button", { name: `Change role for ${nameOf(who)}` });

/** The accounts a list shows, in the order it shows them. */
const namesShown = (page: Page) =>
  table(page).locator("tbody tr td:first-child").allInnerTexts();

const searchBox = (page: Page) =>
  page.getByRole("searchbox", { name: "Search users" });

async function listReady(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Users", exact: true, level: 1 }),
  ).toBeVisible();
  // Whatever the list ends up showing: the table, or one of its empty states.
  // (The first visit to the route in a cold dev server compiles it, hence the room.)
  await expect(
    table(page)
      .or(page.getByText(/^No one matches/))
      .or(page.getByText("No accounts yet")),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function openList(page: Page, search?: string): Promise<void> {
  await reads(2);
  await page.goto(
    search ? `${USERS_PAGE}?search=${encodeURIComponent(search)}` : USERS_PAGE,
  );
  await listReady(page);
}

/** Types into the search box, and waits for the address to say so — the list asks again after a pause. */
async function searchFor(page: Page, term: string): Promise<void> {
  await searchBox(page).fill(term);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("search"))
    .toBe(term);
}

const dialogOf = (page: Page) =>
  page.getByRole("dialog", { name: "Change role" });
const submitOf = (dialog: Locator) =>
  dialog.getByRole("button", { name: /^(Change role|Changing…)$/ });

async function openChange(page: Page, who: Named): Promise<Locator> {
  await changeButton(page, who).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function choose(
  page: Page,
  dialog: Locator,
  roleName: string,
): Promise<void> {
  await dialog.getByRole("combobox", { name: /New role/ }).click();
  await page.getByRole("option", { name: roleName, exact: true }).click();
}

/** The role change the page is about to send, captured as it leaves. */
const nextChangeResponse = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      ROLE_PATH.test(new URL(response.url()).pathname),
  );

/** The role cell of an account's row, which only changes once the list has been re-read. */
const roleCell = (page: Page, who: Named) =>
  rowOf(page, who).getByRole("cell").nth(2);

/** Opens the dialog, chooses a role, optionally says why, and sends it. Waits until the list shows the result. */
async function changeRole(
  page: Page,
  who: Named,
  roleName: string,
  reason?: string,
): Promise<void> {
  const dialog = await openChange(page, who);
  await choose(page, dialog, roleName);
  if (reason) await dialog.getByLabel("Reason (optional)").fill(reason);
  await submitOf(dialog).click();
  await expect(dialog).toHaveCount(0);
  await expect(roleCell(page, who)).toHaveText(roleName);
}

const sorted = (items: string[]) => [...items].sort();

/** The headers a real page from this app attaches to a same-origin `fetch`. */
const fromThisApp = (origin: string, contentType = "application/json") => ({
  origin,
  "sec-fetch-site": "same-origin",
  "content-type": contentType,
});
const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin;

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

const denial = (page: Page) =>
  // Scoped by text: Next's own route announcer is a `role="alert"` too.
  page
    .getByRole("alert")
    .filter({ hasText: "You don't have access to this part" });

/** What a tab does when it comes back to the front: every query that is stale is read again. */
async function refocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
}

async function clerkReady(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
  );
}

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("the list", () => {
  test("shows real accounts newest first with their role and join date, matching the database — and is reached from the sidebar", async ({
    page,
  }) => {
    await reads(4);
    const ana = await person({
      displayName: `${RUN} Ana`,
      username: `e2e_${RUN}_ana`,
      role: "writer",
    });
    const ben = await person({ displayName: `${RUN} Ben`, role: "user" });
    const cyd = await person({
      displayName: `${RUN} Cyd`,
      username: `e2e_${RUN}_cyd`,
      role: "developer",
    });

    await page.goto("/admin");
    const link = page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Users", exact: true });
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("aria-current", "page");
    await link.click();
    await listReady(page);
    await expect(page).toHaveURL(new RegExp(`${USERS_PAGE}$`));
    await expect(page).toHaveTitle("Users — Polyglot Admin");
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByText(
        "A role change takes effect on that person's next request. You can't change your own role.",
      ),
    ).toBeVisible();

    await searchFor(page, RUN);
    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["Name", "Username", "Role", "Joined", "Actions"],
    );
    // Newest account first: the order is the database's, not the browser's.
    const inDatabase = await getE2EUsersTagged(RUN);
    expect(inDatabase.map((who) => who.displayName)).toEqual([
      cyd.displayName,
      ben.displayName,
      ana.displayName,
    ]);
    await expect
      .poll(() => namesShown(page))
      .toEqual(inDatabase.map((who) => who.displayName));
    for (const who of inDatabase) {
      const cells = rowOf(page, who).getByRole("cell");
      await expect(cells.nth(1)).toHaveText(who.username ?? "—");
      await expect(cells.nth(2)).toHaveText(ROLE_NAME[who.role]);
      const joined = await cells
        .nth(3)
        .locator("time")
        .getAttribute("datetime");
      expect(joined!.slice(0, 23)).toBe(
        who.createdAt.toISOString().slice(0, 23),
      );
    }
    await expect(
      page.getByRole("button", { name: /^Change role for / }),
    ).toHaveCount(3);
    await noHash(page);
    await shot(page, "users-list-light");
  });

  test("never lists a sandbox persona or an account with no sign-in — not by name, and not by id", async ({
    page,
  }) => {
    await reads(7);
    const real = await person({ displayName: `${RUN} Real` });
    const persona = await person({
      displayName: `${RUN} Persona`,
      sandbox: true,
    });
    const unlinked = await person({
      displayName: `${RUN} Unlinked`,
      clerkLinked: false,
    });

    await openList(page, RUN);
    await expect.poll(() => namesShown(page)).toEqual([real.displayName]);

    for (const term of [
      nameOf(persona),
      persona.id,
      nameOf(unlinked),
      unlinked.id,
    ]) {
      await searchFor(page, term);
      await expect(page.getByText(`No one matches “${term}”`)).toBeVisible();
      await expect(table(page)).toHaveCount(0);
    }
    await shot(page, "users-empty-search");
  });

  test("finds people by name, username or exact account id — the search lives in the address, and clearing it comes back", async ({
    page,
  }) => {
    await reads(11);
    const ana = await person({
      displayName: `${RUN} Ana`,
      username: `e2e_${RUN}_ana`,
    });
    const ben = await person({
      displayName: `${RUN} Ben`,
      username: `e2e_${RUN}_ben`,
    });
    const fifty = await person({ displayName: `${RUN} 50% off` });
    const plain = await person({ displayName: `${RUN} 50 off` });

    await openList(page, RUN);
    await expect
      .poll(() => namesShown(page))
      .toEqual([plain, fifty, ben, ana].map((who) => who.displayName));
    const historyBefore = await page.evaluate(() => history.length);

    // A name, whatever the case.
    await searchFor(page, "ANA");
    await expect.poll(() => namesShown(page)).toEqual([ana.displayName]);
    // A username that is not in anyone's name.
    await searchFor(page, `e2e_${RUN}_ben`);
    await expect.poll(() => namesShown(page)).toEqual([ben.displayName]);
    // An exact account id — what an audit entry names.
    await searchFor(page, ana.id);
    await expect.poll(() => namesShown(page)).toEqual([ana.displayName]);
    // Part of an id is not an id: this is not a way to enumerate.
    await searchFor(page, ana.id.slice(0, 8));
    await expect(
      page.getByText(`No one matches “${ana.id.slice(0, 8)}”`),
    ).toBeVisible();
    // A `%` is a character to find, not a wildcard.
    await searchFor(page, `${RUN} 50%`);
    await expect.poll(() => namesShown(page)).toEqual([fifty.displayName]);
    expect(new URL(page.url()).searchParams.get("search")).toBe(`${RUN} 50%`);

    // Reload: the same view, from the address alone.
    await reads(2);
    await page.reload();
    await listReady(page);
    await expect(searchBox(page)).toHaveValue(`${RUN} 50%`);
    await expect.poll(() => namesShown(page)).toEqual([fifty.displayName]);

    // Nothing matches: say what was searched for, and offer the way out.
    await searchFor(page, `${RUN} nobody`);
    await expect(
      page.getByText(`No one matches “${RUN} nobody”`),
    ).toBeVisible();
    await shot(page, "users-no-match");
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("search"))
      .toBeNull();
    await expect(table(page)).toBeVisible();
    // Everyone again — the newest accounts first, which are these four.
    await expect
      .poll(async () => (await namesShown(page)).slice(0, 4))
      .toEqual([plain, fifty, ben, ana].map((who) => who.displayName));

    // Typing a search is a refinement of the same view: it never stacked a history entry.
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
  });

  test("pages through the accounts in order, with none repeated and none missed", async ({
    page,
  }) => {
    const tag = `${RUN} bulk`;
    const total = USER_LIST_PAGE_SIZE + 5;
    created.push(...(await seedManyUsers(tag, total)));
    await reads(7);
    const inDatabase = (await getE2EUsersTagged(tag)).map(
      (who) => who.displayName,
    );
    expect(inDatabase).toHaveLength(total);
    const firstPage = inDatabase.slice(0, USER_LIST_PAGE_SIZE);
    const secondPage = inDatabase.slice(USER_LIST_PAGE_SIZE);

    await openList(page, tag);
    await expect.poll(() => namesShown(page)).toEqual(firstPage);
    const next = page.getByRole("button", { name: "Next page" });
    const previous = page.getByRole("button", { name: "Previous page" });
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expect.poll(() => namesShown(page)).toEqual(secondPage);
    expect(new URL(page.url()).searchParams.get("cursor")).toBeTruthy();
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
    await shot(page, "users-list-page-two");

    // The address alone brings the second page back.
    await page.reload();
    await listReady(page);
    await expect.poll(() => namesShown(page)).toEqual(secondPage);

    await previous.click();
    await expect.poll(() => namesShown(page)).toEqual(firstPage);
    expect(new URL(page.url()).searchParams.get("cursor")).toBeNull();
    // Together: exactly the database's accounts, once each.
    expect([...firstPage, ...secondPage]).toEqual(inDatabase);
  });

  test("offers no change on your own row — it says so — while any other account's row has the button", async ({
    page,
  }) => {
    await reads(4);
    const other = await person({ displayName: `${RUN} Other` });

    await openList(page, adminId);
    await expect(table(page).getByText("That's you")).toBeVisible();
    await expect(
      table(page).getByRole("button", { name: /Change role/ }),
    ).toHaveCount(0);
    await shot(page, "users-own-row");

    await searchFor(page, other.id);
    await expect(changeButton(page, other)).toBeVisible();
    await expect(table(page).getByText("That's you")).toHaveCount(0);
  });

  test("exposes nothing private — no email, sign-in id, timezone or progress — in the page or in the API", async ({
    page,
  }) => {
    await reads(4);
    const ana = await person({
      displayName: `${RUN} Ana`,
      username: `e2e_${RUN}_ana`,
    });
    await openList(page, RUN);
    await expect.poll(() => namesShown(page)).toEqual([ana.displayName]);
    const html = await page.content();

    const response = await page.request.get(
      `${USERS_API}?search=${encodeURIComponent(RUN)}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const text = await response.text();
    const { data } = JSON.parse(text);
    expect(Object.keys(data).sort()).toEqual([
      "hasPreviousPage",
      "items",
      "nextCursor",
      "previousCursor",
    ]);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].id).toBe(ana.id);
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual([
        "createdAt",
        "displayName",
        "id",
        "role",
        "updatedAt",
        "username",
      ]);
    }
    // Neither the fixtures' sign-in ids nor the two permanent identities'.
    const secrets = [
      "e2e-fixture-",
      process.env.E2E_ADMIN_CLERK_USER_ID,
      process.env.E2E_LEARNER_CLERK_USER_ID,
    ].filter((secret): secret is string => Boolean(secret));
    expect(secrets.length).toBeGreaterThanOrEqual(3);
    for (const secret of secrets) {
      expect(text, `the API leaked ${secret}`).not.toContain(secret);
      expect(html, `the page leaked ${secret}`).not.toContain(secret);
    }
    for (const word of ["clerk", "email", "@", "timezone", "sandbox"]) {
      expect(text.toLowerCase(), `the API mentions "${word}"`).not.toContain(
        word,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Changing a role                                                            */
/* -------------------------------------------------------------------------- */

test.describe("changing a role", () => {
  test("shows what a change would do before anything is sent — and sends nothing when cancelled", async ({
    page,
  }) => {
    await reads(3);
    const ana = await person({ displayName: `${RUN} Ana`, role: "user" });
    const dee = await person({ displayName: `${RUN} Dee`, role: "admin" });
    const sent: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") sent.push(request.url());
    });
    await openList(page, RUN);

    // A learner: the dialog says who they are now, and nothing is chosen yet.
    let dialog = await openChange(page, ana);
    await expect(dialog).toContainText(`${nameOf(ana)} is currently Learner.`);
    await expect(dialog).toContainText(`Account id: ${ana.id}`);
    const roleSelect = dialog.getByRole("combobox", { name: /New role/ });
    await expect(roleSelect).toHaveText("Learner");
    await expect(submitOf(dialog)).toBeDisabled();
    await expect(
      dialog.getByText(`Choose the role ${nameOf(ana)} should have.`),
    ).toBeVisible();

    // All five roles, least to most privileged.
    await roleSelect.click();
    expect(await page.getByRole("option").allInnerTexts()).toEqual([
      "Learner",
      "Beta tester",
      "Writer",
      "Developer",
      "Admin",
    ]);
    await page.getByRole("option", { name: "Writer", exact: true }).click();

    // What a Writer can do that a Learner cannot — and nothing taken away.
    await expect(
      dialog.getByText(`${nameOf(ana)} will be able to:`),
    ).toBeVisible();
    expect(sorted(await dialog.getByRole("listitem").allInnerTexts())).toEqual(
      sorted(["Open the Admin console", "Browse and write curriculum"]),
    );
    await expect(dialog.getByText(/will no longer be able to/)).toHaveCount(0);
    await expect(
      dialog.getByText(
        "Learner → Writer. Takes effect on their next request. Their progress and settings are not touched.",
      ),
    ).toBeVisible();
    await expect(submitOf(dialog)).toBeEnabled();
    await shot(page, "users-dialog-promote");

    // A beta tester is a learner with full curriculum access, not a console user.
    await choose(page, dialog, "Beta tester");
    expect(await dialog.getByRole("listitem").allInnerTexts()).toEqual([
      "Full curriculum access as a learner, whatever the access tier",
    ]);

    // Back to what they already are: nothing to confirm.
    await choose(page, dialog, "Learner");
    await expect(
      dialog.getByText(`Choose the role ${nameOf(ana)} should have.`),
    ).toBeVisible();
    await expect(submitOf(dialog)).toBeDisabled();

    // Cancelling changes nothing, and puts the person back where they were.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(changeButton(page, ana)).toBeFocused();

    // Taking access away is a warning, in full, before it can be confirmed.
    dialog = await openChange(page, dee);
    await expect(dialog).toContainText(`${nameOf(dee)} is currently Admin.`);
    await choose(page, dialog, "Learner");
    const warning = dialog.getByRole("alert");
    await expect(warning).toContainText(
      `${nameOf(dee)} will no longer be able to:`,
    );
    expect(sorted(await warning.getByRole("listitem").allInnerTexts())).toEqual(
      sorted([
        "Open the Admin console",
        "Browse and write curriculum",
        "Publish curriculum, and manage levels, groups, imports and official decks",
        "Read the logs and use the sandbox",
        "See every account and change other people's roles",
      ]),
    );
    await expect(dialog.getByText(/will be able to:/)).toHaveCount(0);
    await shot(page, "users-dialog-demote-warning");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // Nothing was sent, nothing changed.
    expect(sent).toEqual([]);
    expect((await getE2EUser(ana.id))?.role).toBe("user");
    expect((await getE2EUser(dee.id))?.role).toBe("admin");
    expect(await getE2ERoleAudits(ana.id)).toEqual([]);
    expect(await getE2ERoleAudits(dee.id)).toEqual([]);
  });

  test("changes the role once and says so — the row, the database and the audit trail agree, and nothing else about the person moves", async ({
    page,
  }) => {
    await reads(6);
    await changes(1);
    const ana = await person({
      displayName: `${RUN} Ana`,
      username: `e2e_${RUN}_ana`,
    });
    const ben = await person({ displayName: `${RUN} Ben` });
    const token = await getE2EVersionToken(ana.id);
    const footprint = await getE2EUserFootprint(ana.id);
    const benToken = await getE2EVersionToken(ben.id);
    await openList(page, RUN);

    const dialog = await openChange(page, ana);
    await choose(page, dialog, "Writer");
    await dialog
      .getByLabel("Reason (optional)")
      .fill("  Reviews lessons for the Spanish launch  ");
    const answered = nextChangeResponse(page);
    await submitOf(dialog).click();
    const response = await answered;

    // What was sent: the choice, the version the Admin saw, an intent key — and
    // the reason, trimmed. Never who is acting or who is being changed.
    const body = response.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual([
      "expectedUpdatedAt",
      "idempotencyKey",
      "reason",
      "role",
    ]);
    expect(body).toMatchObject({
      role: "writer",
      expectedUpdatedAt: token,
      reason: "Reviews lessons for the Spanish launch",
    });
    expect(body.idempotencyKey).toMatch(UUID);
    expect(new URL(response.url()).pathname).toBe(
      `${USERS_API}/${ana.id}/role`,
    );
    expect(response.status()).toBe(200);
    const newToken = await getE2EVersionToken(ana.id);
    expect((await response.json()).data).toEqual({
      userId: ana.id,
      role: "writer",
      updatedAt: newToken,
    });
    expect(newToken).not.toBe(token);

    // What the Admin sees: told, the dialog gone, and the row showing the new role.
    await expect(page.getByText(`${nameOf(ana)} is now Writer.`)).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(roleCell(page, ana)).toHaveText("Writer");
    await expect(roleCell(page, ben)).toHaveText("Learner");
    await shot(page, "users-role-changed");

    // What the database holds: the role, and nothing else about the person.
    expect((await getE2EUser(ana.id))?.role).toBe("writer");
    expect(await getE2EUserFootprint(ana.id)).toEqual(footprint);
    expect(await getE2EUser(ben.id)).toMatchObject({ role: "user" });
    expect(await getE2EVersionToken(ben.id)).toBe(benToken);

    // One change, one audit event — who, whom, from what to what, and why.
    const audits = await getE2ERoleAudits(ana.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "USER_ROLE_CHANGED",
      resourceType: "user",
      resourceId: ana.id,
      actorUserId: adminId,
      beforeData: { role: "user" },
      afterData: { role: "writer" },
      reason: "Reviews lessons for the Spanish launch",
      correlationId: body.idempotencyKey,
    });
    expect(await getE2ERoleAudits(ben.id)).toEqual([]);

    // Still so after a reload.
    await reads(2);
    await page.reload();
    await listReady(page);
    await expect(roleCell(page, ana)).toHaveText("Writer");

    // And the audit history, where Admins read it, has the entry — who, whom,
    // why, and the role before and after.
    await page.goto(
      `/admin/logs?tab=audit&action=USER_ROLE_CHANGED&resourceId=${ana.id}`,
    );
    const entry = page
      .getByRole("row")
      .filter({ hasText: "USER_ROLE_CHANGED" });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText(`user · ${ana.id.slice(0, 8)}…`);
    await expect(entry).toContainText("Reviews lessons for the Spanish launch");
    await entry.getByRole("button", { name: "Show details" }).click();
    await expect(page.locator("pre").nth(0)).toContainText('"role": "user"');
    await expect(page.locator("pre").nth(1)).toContainText('"role": "writer"');
  });

  test("sends no reason when none is given, and refuses one that is too long — in the dialog, before anything is sent", async ({
    page,
  }) => {
    await reads(4);
    await changes(1);
    const ben = await person({ displayName: `${RUN} Ben` });
    const sent: unknown[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") sent.push(request.postDataJSON());
    });
    await openList(page, RUN);

    const dialog = await openChange(page, ben);
    await choose(page, dialog, "Beta tester");
    const reason = dialog.getByLabel("Reason (optional)");
    await reason.fill("x".repeat(201));
    await submitOf(dialog).click();
    await expect(
      dialog.getByText("Keep the reason to 200 characters or fewer."),
    ).toBeVisible();
    expect(sent).toEqual([]);
    expect((await getE2EUser(ben.id))?.role).toBe("user");

    // Spaces are not a reason.
    await reason.fill("   ");
    const answered = nextChangeResponse(page);
    await submitOf(dialog).click();
    expect((await answered).status()).toBe(200);
    await expect(dialog).toHaveCount(0);
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0] as object).sort()).toEqual([
      "expectedUpdatedAt",
      "idempotencyKey",
      "role",
    ]);
    const [audit] = await getE2ERoleAudits(ben.id);
    expect(audit).toMatchObject({
      afterData: { role: "beta-tester" },
      reason: null,
    });
  });

  test("changes the role once however hard the button is pressed", async ({
    page,
  }) => {
    await reads(4);
    await changes(2);
    const cyd = await person({ displayName: `${RUN} Cyd` });
    const keys: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH")
        keys.push(request.postDataJSON().idempotencyKey);
    });
    await openList(page, RUN);

    const dialog = await openChange(page, cyd);
    await choose(page, dialog, "Admin");
    await submitOf(dialog).dblclick();
    await expect(dialog).toHaveCount(0);
    await expect(roleCell(page, cyd)).toHaveText("Admin");

    // Whatever was sent was one intent, and it happened once.
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(new Set(keys).size).toBe(1);
    expect((await getE2EUser(cyd.id))?.role).toBe("admin");
    expect(await getE2ERoleAudits(cyd.id)).toHaveLength(1);
  });

  test("is operable by keyboard alone — from the row's button, through the form, to confirming", async ({
    page,
  }) => {
    await reads(4);
    await changes(1);
    const ana = await person({ displayName: `${RUN} Ana` });
    await openList(page, RUN);

    await changeButton(page, ana).focus();
    await expect(changeButton(page, ana)).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();

    // The role menu opens, moves and chooses from the keyboard...
    const roleSelect = dialog.getByRole("combobox", { name: /New role/ });
    await roleSelect.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("ArrowDown"); // Learner -> Beta tester
    await page.keyboard.press("ArrowDown"); // -> Writer
    await page.keyboard.press("Enter");
    await expect(roleSelect).toHaveText("Writer");
    await expect(roleSelect).toBeFocused();

    // ...and the rest of the form is reached in reading order, ending on the button.
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Reason (optional)")).toBeFocused();
    await page.keyboard.type("Typed without a mouse");
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(submitOf(dialog)).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(dialog).toHaveCount(0);
    await expect(roleCell(page, ana)).toHaveText("Writer");
    const [audit] = await getE2ERoleAudits(ana.id);
    expect(audit).toMatchObject({
      afterData: { role: "writer" },
      reason: "Typed without a mouse",
    });
  });

  test("a send that fails can be retried as the same intent, and a different choice is a new one — one change, one audit event", async ({
    page,
  }) => {
    await reads(4);
    await changes(1);
    const ben = await person({ displayName: `${RUN} Ben` });
    const bodies: { role: string; idempotencyKey: string }[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") bodies.push(request.postDataJSON());
    });
    const pattern = "**/api/v1/admin/users/*/role";
    await page.route(pattern, (route) => route.abort("connectionreset"));
    await openList(page, RUN);

    const dialog = await openChange(page, ben);
    const failed = dialog.getByText(
      "Couldn't reach the server. Check your connection and try again.",
    );
    await choose(page, dialog, "Writer");
    await submitOf(dialog).click();
    await expect(failed).toBeVisible();
    // It can be tried again: the dialog is still a form, with what was chosen.
    await expect(submitOf(dialog)).toBeEnabled();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();

    // The same request again: the same intent.
    await submitOf(dialog).click();
    await expect.poll(() => bodies.length).toBe(2);
    await expect(failed).toBeVisible();

    // Another role is another request: a new intent.
    await choose(page, dialog, "Developer");
    await submitOf(dialog).click();
    await expect.poll(() => bodies.length).toBe(3);
    await expect(failed).toBeVisible();

    // The network comes back; the unchanged retry goes through under the key it already had.
    await page.unroute(pattern);
    await submitOf(dialog).click();
    await expect(dialog).toHaveCount(0);
    await expect(roleCell(page, ben)).toHaveText("Developer");

    expect(bodies).toHaveLength(4);
    expect(bodies[1]!.idempotencyKey).toBe(bodies[0]!.idempotencyKey);
    expect(bodies[2]!.role).toBe("developer");
    expect(bodies[2]!.idempotencyKey).not.toBe(bodies[0]!.idempotencyKey);
    expect(bodies[3]!.idempotencyKey).toBe(bodies[2]!.idempotencyKey);
    // Only the last one ever reached the server.
    expect((await getE2EUser(ben.id))?.role).toBe("developer");
    const audits = await getE2ERoleAudits(ben.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.correlationId).toBe(bodies[3]!.idempotencyKey);
  });

  test("refuses a change to an account someone else has changed since the list was read — nothing is overwritten, and the list is re-read on close", async ({
    page,
  }) => {
    await reads(6);
    await changes(2);
    const ana = await person({ displayName: `${RUN} Ana`, role: "user" });
    await openList(page, RUN);
    const dialog = await openChange(page, ana);
    await choose(page, dialog, "Writer");

    // Another Admin gets there first.
    await setE2EUserRole(ana.id, "developer");
    await submitOf(dialog).click();

    await expect(
      dialog.getByText(
        "This account changed after you opened the list. Reload to see its current role, then try again.",
      ),
    ).toBeVisible();
    // Pressing again cannot help, so the dialog offers to close and nothing else.
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^(Cancel|Change role)$/ }),
    ).toHaveCount(0);
    await shot(page, "users-conflict");
    expect((await getE2EUser(ana.id))?.role).toBe("developer");
    expect(await getE2ERoleAudits(ana.id)).toEqual([]);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    // The list now says what the account really is.
    await expect(roleCell(page, ana)).toHaveText("Developer");
    expect((await getE2EUser(ana.id))?.role).toBe("developer");

    // It is the account that is versioned, not the role: any change to it since
    // the list was read — here, a rename — is just as stale.
    const again = await openChange(page, ana);
    await choose(page, again, "Writer");
    const renamed = `${RUN} Ana (renamed)`;
    await renameE2EUser(ana.id, renamed);
    await submitOf(again).click();
    await expect(
      again.getByText(
        "This account changed after you opened the list. Reload to see its current role, then try again.",
      ),
    ).toBeVisible();
    await again.getByRole("button", { name: "Close" }).click();
    await expect(again).toHaveCount(0);
    await expect(rowOf(page, { displayName: renamed })).toBeVisible();
    expect((await getE2EUser(ana.id))?.role).toBe("developer");
    expect(await getE2ERoleAudits(ana.id)).toEqual([]);
  });

  test("reports an account that is gone, closes, and the list no longer has it", async ({
    page,
  }) => {
    await reads(4);
    await changes(1);
    const ben = await person({ displayName: `${RUN} Ben` });
    const cyd = await person({ displayName: `${RUN} Cyd` });
    await openList(page, RUN);
    const dialog = await openChange(page, ben);
    await choose(page, dialog, "Writer");

    await removeSeededUsers([ben.id]);
    await submitOf(dialog).click();

    await expect(
      dialog.getByText("That user could not be found."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, ben)).toHaveCount(0);
    await expect(rowOf(page, cyd)).toBeVisible();
  });

  test("a role revoked while the dialog is open is refused by the server — nothing changes, and only Close is offered", async ({
    page,
  }) => {
    await reads(3);
    await changes(1);
    const ana = await person({ displayName: `${RUN} Ana` });
    await openList(page, RUN);
    const dialog = await openChange(page, ana);
    await choose(page, dialog, "Admin");

    // The page still believes this person is an Admin; the database no longer does.
    await setE2EAdminRole("writer");
    await submitOf(dialog).click();

    await expect(dialog).toContainText(
      "You don't have access to this part of the admin console.",
    );
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /^(Cancel|Change role)$/ }),
    ).toHaveCount(0);
    expect((await getE2EUser(ana.id))?.role).toBe("user");
    expect(await getE2ERoleAudits(ana.id)).toEqual([]);
  });

  test("every role can be given and taken away — a learner goes through all five, one change at a time", async ({
    page,
  }) => {
    await reads(8);
    await changes(5);
    const ana = await person({ displayName: `${RUN} Ana`, role: "user" });
    await openList(page, RUN);

    const path: [UserRole, string][] = [
      ["beta-tester", "Beta tester"],
      ["writer", "Writer"],
      ["developer", "Developer"],
      ["admin", "Admin"],
      ["user", "Learner"],
    ];
    for (const [role, name] of path) {
      await changeRole(page, ana, name);
      expect((await getE2EUser(ana.id))?.role).toBe(role);
    }

    // The audit trail is the whole story, newest first, each step from the one before.
    const audits = await getE2ERoleAudits(ana.id);
    expect(audits.map((event) => [event.beforeData, event.afterData])).toEqual([
      [{ role: "admin" }, { role: "user" }],
      [{ role: "developer" }, { role: "admin" }],
      [{ role: "writer" }, { role: "developer" }],
      [{ role: "beta-tester" }, { role: "writer" }],
      [{ role: "user" }, { role: "beta-tester" }],
    ]);
    expect(new Set(audits.map((event) => event.actorUserId))).toEqual(
      new Set([adminId]),
    );
  });

  test("takes effect on the person's very next request — a learner promoted to Writer is let in, and turned away again once demoted — with their progress untouched", async ({
    page,
    browser,
  }) => {
    await reads(5);
    await changes(2);
    await ensureLearnerOnboarded();
    const footprint = await getE2EUserFootprint(learnerId);
    const learnerContext = await browser.newContext({
      storageState: LEARNER_AUTH,
    });
    const learnerPage = await learnerContext.newPage();
    try {
      await renewSession(learnerPage);
      const statusOf = async (path: string) => {
        const response = await learnerPage.goto(path);
        await clerkReady(learnerPage);
        return response?.status();
      };

      // A learner is turned away from the whole console.
      expect(await statusOf("/admin")).toBe(403);
      expect(await statusOf("/admin/curriculum")).toBe(403);

      // The Admin promotes them, through the screen.
      await openList(page, learnerId);
      const learnerRow = page.getByRole("button", {
        name: /^Change role for /,
      });
      await expect(learnerRow).toHaveCount(1);
      await learnerRow.click();
      let dialog = dialogOf(page);
      await choose(page, dialog, "Writer");
      await dialog
        .getByLabel("Reason (optional)")
        .fill("Temporary access for the end-to-end check");
      await submitOf(dialog).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        table(page).getByRole("cell", { name: "Writer", exact: true }),
      ).toBeVisible();

      // The learner's very next request: in. A Writer works on curriculum...
      expect(await statusOf("/admin/curriculum")).toBe(200);
      // ...but is not an Admin: no accounts, no roles.
      expect(await statusOf(USERS_PAGE)).toBe(403);
      expect((await learnerPage.request.get(USERS_API)).status()).toBe(403);

      // The Admin takes it back.
      await learnerRow.click();
      dialog = dialogOf(page);
      await choose(page, dialog, "Learner");
      await submitOf(dialog).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        table(page).getByRole("cell", { name: "Learner", exact: true }),
      ).toBeVisible();

      // And the very next request after that: out again.
      expect(await statusOf("/admin/curriculum")).toBe(403);
      expect(await statusOf("/admin")).toBe(403);
    } finally {
      await learnerContext.close();
    }

    // Two changes, both on the trail; the learner's account and progress untouched.
    expect((await getE2EUser(learnerId))?.role).toBe("user");
    expect(await getE2EUserFootprint(learnerId)).toEqual(footprint);
    const audits = await getE2ERoleAudits(learnerId);
    expect(audits.map((event) => [event.beforeData, event.afterData])).toEqual([
      [{ role: "writer" }, { role: "user" }],
      [{ role: "user" }, { role: "writer" }],
    ]);
    expect(audits.map((event) => event.reason)).toEqual([
      null,
      "Temporary access for the end-to-end check",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Who may use it                                                             */
/* -------------------------------------------------------------------------- */

test.describe("who may use it", () => {
  test("only an Admin gets the page, the sidebar link and the endpoints — a writer, developer, beta tester and learner get 403, and nothing changes", async ({
    page,
    baseURL,
  }) => {
    await reads(3);
    const target = await person({ displayName: `${RUN} Target` });
    const token = await getE2EVersionToken(target.id);
    const headers = fromThisApp(originOf(baseURL));
    const sidebar = page.getByRole("navigation", { name: "Admin" });

    for (const role of [
      "writer",
      "developer",
      "beta-tester",
      "user",
    ] as const) {
      await setE2EAdminRole(role);
      const response = await page.goto(USERS_PAGE);
      expect(response?.status(), `${role}: the page`).toBe(403);
      await clerkReady(page);
      expect(
        (
          await page.request.get(
            `${USERS_API}?search=${encodeURIComponent(RUN)}`,
          )
        ).status(),
        `${role}: the list`,
      ).toBe(403);
      expect(
        (
          await page.request.patch(`${USERS_API}/${target.id}/role`, {
            headers,
            data: {
              role: "admin",
              expectedUpdatedAt: token,
              idempotencyKey: crypto.randomUUID(),
            },
          })
        ).status(),
        `${role}: a change`,
      ).toBe(403);
      // Writers and developers are let into the console — just not into this part of it.
      if (role === "writer" || role === "developer") {
        expect((await page.goto("/admin"))?.status(), role).toBe(200);
        await expect(sidebar).toBeVisible();
        await expect(sidebar.getByRole("link", { name: "Users" })).toHaveCount(
          0,
        );
      }
    }

    // Nobody got anywhere: not a role changed, not a trace in the audit trail.
    await setE2EAdminRole("admin");
    expect((await getE2EUser(target.id))?.role).toBe("user");
    expect(await getE2EVersionToken(target.id)).toBe(token);
    expect(await getE2ERoleAudits(target.id)).toEqual([]);

    // The Admin has all of it.
    await openList(page, RUN);
    await expect(sidebar.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(changeButton(page, target)).toBeVisible();
  });

  test("a role revoked while the list is open replaces it with access-denied on refocus — no account lingers beside the denial", async ({
    page,
  }) => {
    await reads(5);
    const ana = await person({ displayName: `${RUN} Ana` });
    await openList(page, RUN);
    await expect(changeButton(page, ana)).toBeVisible();

    // Still in the console, no longer an Admin: this part is closed to them.
    await setE2EAdminRole("writer");
    await refocus(page);
    await expect(denial(page)).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Change role for / }),
    ).toHaveCount(0);
    await shot(page, "users-list-denied");
  });
});

/* -------------------------------------------------------------------------- */
/* What the endpoints refuse                                                  */
/* -------------------------------------------------------------------------- */

test.describe("what the endpoints refuse", () => {
  let target: E2EUser;
  let persona: E2EUser;
  let unlinked: E2EUser;
  let targetToken = "";

  test.beforeAll(async () => {
    target = await seedUser({
      displayName: `${RUN} target`,
      username: `e2e_${RUN}_target`,
    });
    persona = await seedUser({ displayName: `${RUN} persona`, sandbox: true });
    unlinked = await seedUser({
      displayName: `${RUN} unlinked`,
      clerkLinked: false,
    });
    targetToken = await getE2EVersionToken(target.id);
  });
  test.afterAll(async () => {
    await removeSeededUsers([target.id, persona.id, unlinked.id]);
  });

  const roleUrl = (id: string) => `${USERS_API}/${id}/role`;
  const change = (over: Record<string, unknown> = {}) => ({
    role: "writer",
    expectedUpdatedAt: targetToken,
    idempotencyKey: crypto.randomUUID(),
    ...over,
  });
  const untouched = async () => {
    for (const who of [target, persona, unlinked]) {
      expect((await getE2EUser(who.id))?.role, nameOf(who)).toBe("user");
      expect(await getE2ERoleAudits(who.id), nameOf(who)).toEqual([]);
    }
    expect(await getE2EVersionToken(target.id)).toBe(targetToken);
    expect((await getE2EUser(adminId))?.role).toBe("admin");
  };

  test("a cross-site page cannot change a role as a signed-in Admin", async ({
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
      const response = await page.request.patch(roleUrl(target.id), {
        headers,
        data: change(),
      });
      expect(response.status(), name).toBe(403);
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
      const response = await page.request.patch(roleUrl(target.id), {
        headers: fromThisApp(originOf(baseURL), type),
        data: JSON.stringify(change()),
      });
      expect(response.status(), type).toBe(415);
    }
    const inQuery = await page.request.patch(
      `${roleUrl(target.id)}?role=admin`,
      { headers, data: change() },
    );
    expect(inQuery.status()).toBe(422);
    const big = await page.request.patch(roleUrl(target.id), {
      headers,
      data: JSON.stringify({ ...change(), padding: "x".repeat(10_000) }),
    });
    expect(big.status()).toBe(413);
    await untouched();
  });

  test("malformed and over-eager bodies are refused — the body cannot name who acts, whom, a sign-in id, or any progress", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const bodies: [string, unknown][] = [
      ["invalid JSON", "{not json"],
      // One person at a time: a list of changes is not a change.
      ["a list of changes", [change(), change()]],
      ["no role", change({ role: undefined })],
      ["an unknown role", change({ role: "owner" })],
      ["a role in the wrong case", change({ role: "Admin" })],
      ["an empty role", change({ role: "" })],
      ["a null role", change({ role: null })],
      ["a list of roles", change({ role: ["admin", "writer"] })],
      ["no version token", change({ expectedUpdatedAt: undefined })],
      [
        "a version token that is not an instant",
        change({ expectedUpdatedAt: "yesterday" }),
      ],
      ["a date with no time", change({ expectedUpdatedAt: "2026-01-01" })],
      ["an empty reason", change({ reason: "" })],
      ["a reason of only spaces", change({ reason: "   " })],
      ["a reason over 200 characters", change({ reason: "x".repeat(201) })],
      ["a reason that is not text", change({ reason: 5 })],
      ["no intent key", change({ idempotencyKey: undefined })],
      [
        "an intent key that is not a UUID",
        change({ idempotencyKey: "retry-1" }),
      ],
      ["an actor", change({ actorUserId: adminId })],
      ["another account in the body", change({ userId: persona.id })],
      ["a target in the body", change({ targetUserId: persona.id })],
      ["a sign-in id", change({ clerkUserId: "user_123" })],
      ["an email", change({ email: "someone@example.com" })],
      ["a sandbox flag", change({ isSandbox: true })],
      ["a progress change", change({ progress: { level: 50 } })],
    ];
    for (const [name, data] of bodies) {
      const response = await page.request.patch(roleUrl(target.id), {
        headers,
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
      expect(response.status(), name).toBe(422);
    }
    await untouched();
  });

  test("the rules hold at the endpoint, in the Admin's own words: not yourself, not a persona, not a stale version, not the role they have, not a stranger", async ({
    page,
    baseURL,
  }) => {
    // Each of these reaches the service, which counts it against the limit.
    await changes(6);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const refused = async (
      id: string,
      data: unknown,
      status: number,
      message: string,
      why: string,
    ) => {
      const response = await page.request.patch(roleUrl(id), { headers, data });
      expect(response.status(), why).toBe(status);
      expect((await response.json()).error.message, why).toBe(message);
    };
    const notReal = "Only real, signed-up accounts can be given a role here.";

    await refused(
      adminId,
      change({ expectedUpdatedAt: await getE2EVersionToken(adminId) }),
      422,
      "You can't change your own role. Ask another Admin.",
      "your own role",
    );
    await refused(
      persona.id,
      change({ expectedUpdatedAt: await getE2EVersionToken(persona.id) }),
      422,
      notReal,
      "a sandbox persona",
    );
    await refused(
      unlinked.id,
      change({ expectedUpdatedAt: await getE2EVersionToken(unlinked.id) }),
      422,
      notReal,
      "an account with no sign-in",
    );
    await refused(
      target.id,
      change({ expectedUpdatedAt: "2000-01-01T00:00:00.000000Z" }),
      409,
      "This account changed after you opened the list. Reload to see its current role, then try again.",
      "a stale version",
    );
    await refused(
      target.id,
      change({ role: "user" }),
      422,
      "That person already has that role.",
      "the role they already have",
    );
    await refused(
      crypto.randomUUID(),
      change(),
      404,
      "That user could not be found.",
      "an account that does not exist",
    );
    // A malformed id never reaches the service — nor does a list of them.
    for (const id of ["not-an-id", `${target.id},${persona.id}`]) {
      expect(
        (
          await page.request.patch(roleUrl(id), { headers, data: change() })
        ).status(),
        id,
      ).toBe(422);
    }
    await untouched();
  });

  test("the list takes a search and a cursor, and nothing else — no role filter, no sandbox switch, no sort, no oversize page", async ({
    page,
  }) => {
    await renewSession(page);
    for (const query of [
      "role=admin",
      "includeSandbox=true",
      "sandbox=1",
      "sort=displayName",
      "order=ASC",
      "limit=0",
      "limit=1000",
      "limit=lots",
      "search=",
      `search=${"x".repeat(101)}`,
      "cursor=",
      "cursor=not-a-cursor",
    ]) {
      expect(
        (await page.request.get(`${USERS_API}?${query}`)).status(),
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
    for (const method of ["post", "put", "patch", "delete"] as const) {
      expect(
        (await page.request[method](USERS_API, { headers, data: {} })).status(),
        `${method} on the list`,
      ).toBe(405);
    }
    for (const method of ["get", "post", "put", "delete"] as const) {
      expect(
        (await page.request[method](roleUrl(target.id), { headers })).status(),
        `${method} on a role`,
      ).toBe(405);
    }
    await untouched();
  });

  test("an anonymous caller gets 401 and a learner 403, from both endpoints", async ({
    browser,
    baseURL,
  }) => {
    const headers = fromThisApp(originOf(baseURL));
    const calls = (request: Page["request"]) => [
      () => request.get(`${USERS_API}?search=${encodeURIComponent(RUN)}`),
      () => request.patch(roleUrl(target.id), { headers, data: change() }),
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

  test("privileged responses are never cached — the list, a change, and a refusal", async ({
    page,
    baseURL,
  }) => {
    await reads(1);
    await changes(2);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const fresh = await person({ displayName: `${RUN} cache` });

    const list = await page.request.get(
      `${USERS_API}?search=${encodeURIComponent(RUN)}`,
    );
    expect(list.status()).toBe(200);
    expect(list.headers()["cache-control"]).toContain("no-store");

    const made = await page.request.patch(roleUrl(fresh.id), {
      headers,
      data: {
        role: "beta-tester",
        expectedUpdatedAt: await getE2EVersionToken(fresh.id),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(made.status()).toBe(200);
    expect(made.headers()["cache-control"]).toContain("no-store");

    const refused = await page.request.patch(roleUrl(fresh.id), {
      headers,
      data: {
        role: "beta-tester",
        expectedUpdatedAt: await getE2EVersionToken(fresh.id),
        idempotencyKey: crypto.randomUUID(),
      },
    });
    expect(refused.status()).toBe(422);
    expect(refused.headers()["cache-control"]).toContain("no-store");
  });

  test("a replayed command is answered from the stored result; the same key for another request is refused", async ({
    page,
    baseURL,
  }) => {
    await changes(3);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const fresh = await person({ displayName: `${RUN} replay` });
    const token = await getE2EVersionToken(fresh.id);
    const key = crypto.randomUUID();
    const send = (role: UserRole) =>
      page.request.patch(roleUrl(fresh.id), {
        headers,
        data: { role, expectedUpdatedAt: token, idempotencyKey: key },
      });

    const first = await send("writer");
    expect(first.status()).toBe(200);
    const stored = (await first.json()).data;
    expect(stored.role).toBe("writer");

    // Sent again, as a retry after a lost response would be — though the
    // account has moved on since, so its version no longer matches the token.
    const replay = await send("writer");
    expect(replay.status()).toBe(200);
    expect((await replay.json()).data).toEqual(stored);
    // One change, one audit event — not two.
    expect(await getE2ERoleAudits(fresh.id)).toHaveLength(1);

    // The same key for a different request is a different intent: refused.
    const reused = await send("developer");
    expect(reused.status()).toBe(409);
    expect((await getE2EUser(fresh.id))?.role).toBe("writer");
    expect(await getE2ERoleAudits(fresh.id)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables — the list, the dialog, and its warning", async ({
    page,
  }) => {
    await reads(3);
    const dee = await person({ displayName: `${RUN} Dee`, role: "admin" });
    await person({ displayName: `${RUN} Ana`, role: "writer" });
    await page.emulateMedia({ colorScheme: "dark" });
    await openList(page, RUN);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await shot(page, "users-list-dark");

    const dialog = await openChange(page, dee);
    await choose(page, dialog, "Learner");
    await expect(dialog.getByRole("alert")).toBeVisible();

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
      const title = document.querySelector("#change-role-title") as HTMLElement;
      const warning = paper.querySelector('[role="alert"]') as HTMLElement;
      const [red = 255, green = 255, blue = 255] = (
        getComputedStyle(warning).backgroundColor.match(/\d+(\.\d+)?/g) ?? []
      ).map(Number);
      const result = {
        paper: getComputedStyle(paper).backgroundColor,
        expectedPaper: resolve("backgroundColor", "--bg-surface"),
        title: getComputedStyle(title).color,
        expectedTitle: resolve("color", "--text-primary"),
        // A warning in the dark theme must not be a light slab (Material's
        // default is near-white), which would glare and lose its text.
        warningBrightness: (red * 0.299 + green * 0.587 + blue * 0.114) / 255,
      };
      probe.remove();
      return result;
    });
    expect(painted.paper).toBe(painted.expectedPaper);
    expect(painted.title).toBe(painted.expectedTitle);
    expect(painted.warningBrightness).toBeLessThan(0.5);
    await shot(page, "users-dialog-demote-dark");
  });

  test("lays out at 390px without scrolling the page sideways — the list, the pinned action, and the dialog", async ({
    page,
  }) => {
    await reads(3);
    const ana = await person({
      displayName: `${RUN} A fairly long display name that has to wrap`,
      username: `e2e_${RUN}_long_username`,
      role: "developer",
    });
    await person({ displayName: `${RUN} Dee`, role: "admin" });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

    await openList(page, RUN);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // What the screen is for — who holds which role — is on screen, and so is
    // the action beside it, with no sideways scrolling inside the table either
    // (the username and the join date give way first).
    await expect(roleCell(page, ana)).toBeInViewport({ ratio: 1 });
    const action = changeButton(page, ana);
    await expect(action).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(() => {
        const frame = document.querySelector(
          ".RaDataTable-tableWrapper",
        ) as HTMLElement;
        return frame.scrollWidth - frame.clientWidth;
      }),
    ).toBeLessThanOrEqual(0);
    await expect(
      table(page).getByRole("columnheader", { name: "Username" }),
    ).toBeHidden();
    await shot(page, "users-list-mobile");

    await action.click();
    const dialog = dialogOf(page);
    await choose(page, dialog, "Learner");
    await expect(dialog.getByRole("alert")).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Taller than the screen is fine; the way to confirm or cancel must still be reachable.
    await expect(submitOf(dialog)).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Cancel" }),
    ).toBeInViewport();
    await shot(page, "users-dialog-mobile");

    // And the way back to this screen is in the menu.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Open Admin navigation" }).click();
    const menu = page.getByRole("dialog", { name: "Admin" });
    await expect(
      menu.getByRole("link", { name: "Users", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await shot(page, "users-menu-mobile");
  });
});

/* -------------------------------------------------------------------------- */
/* Rate limits — last, because they use a limit up on purpose                 */
/* -------------------------------------------------------------------------- */

test.describe("rate limits", () => {
  test("reading the list is limited — a burst is answered 429 with Retry-After, and nothing is leaked by the refusal", async ({
    page,
  }) => {
    await renewSession(page);
    // Everything this spec may spend, so the window is clean when the burst starts.
    await spendRateBudget("admin-user-search", 24);
    const statuses: number[] = [];
    let limited: APIResponse | undefined;
    for (let attempt = 0; attempt < 40 && !limited; attempt++) {
      const response = await page.request.get(
        `${USERS_API}?search=${encodeURIComponent(RUN)}`,
      );
      statuses.push(response.status());
      if (response.status() === 429) limited = response;
    }
    markRateLimitExhausted("admin-user-search");

    expect(limited, `statuses: ${statuses.join(" ")}`).toBeDefined();
    // Allowed, allowed, ... refused: nothing else on the way.
    expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true);
    expect(statuses.length).toBeLessThanOrEqual(31);
    expect(
      Number(limited!.headers()["retry-after"]),
      "Retry-After",
    ).toBeGreaterThan(0);
    expect(limited!.headers()["cache-control"]).toContain("no-store");
    const body = await limited!.json();
    expect(body.error.message).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("items");
  });

  test("changing roles is limited — a burst of refused changes is answered 429, and every one before it changed nothing", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const persona = await person({
      displayName: `${RUN} burst`,
      sandbox: true,
    });
    const token = await getE2EVersionToken(persona.id);
    const headers = fromThisApp(originOf(baseURL));
    await spendRateBudget("admin-role-change", 8);
    const statuses: number[] = [];
    let limited: APIResponse | undefined;
    // A persona is refused by the rules every time (422), so each request is
    // counted by the limit and none of them can change anything.
    for (let attempt = 0; attempt < 15 && !limited; attempt++) {
      const response = await page.request.patch(
        `${USERS_API}/${persona.id}/role`,
        {
          headers,
          data: {
            role: "admin",
            expectedUpdatedAt: token,
            idempotencyKey: crypto.randomUUID(),
          },
        },
      );
      statuses.push(response.status());
      if (response.status() === 429) limited = response;
    }
    markRateLimitExhausted("admin-role-change");

    expect(limited, `statuses: ${statuses.join(" ")}`).toBeDefined();
    expect(statuses.slice(0, -1).every((status) => status === 422)).toBe(true);
    expect(statuses.length).toBeLessThanOrEqual(11);
    expect(Number(limited!.headers()["retry-after"])).toBeGreaterThan(0);
    expect(limited!.headers()["cache-control"]).toContain("no-store");
    expect((await getE2EUser(persona.id))?.role).toBe("user");
    expect(await getE2ERoleAudits(persona.id)).toEqual([]);
  });
});
