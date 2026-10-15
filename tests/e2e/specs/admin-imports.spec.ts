import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

import { IMPORT_LIST_PAGE_SIZE, type AdminImportPage } from "@/domains/admin";

import {
  advanceE2EImport,
  countE2EImportAudits,
  countE2EImportRows,
  countE2EPublishAudits,
  getE2EAdminScope,
  getE2EAdminStatusCounts,
  getE2EAdminUserId,
  getE2EImport,
  getE2EImportAuditActions,
  getE2EImportRowDispositions,
  getE2EImportsTagged,
  getE2EItemState,
  removeImportsNamed,
  removeSeededImports,
  removeSeededItems,
  seedEmptyLanguage,
  seedExtraVocabulary,
  seedImport,
  seedImportRows,
  seedItemWithDraft,
  seedManyImports,
  setE2EAdminRole,
  setE2EImportArchived,
  type E2EImport,
  type SeedImportOptions,
  type SeedImportRow,
} from "../support/e2e-admin";
import { renewSession } from "../support/e2e-session";
import {
  markRateLimitExhausted,
  spendRateBudget,
} from "../support/rate-budget";

/**
 * Spec 26 Unit 8 — the curriculum-import history (`/admin/curriculum/imports`
 * and `/archived`) on React Admin, and the import's own page that it links to,
 * against the real signed-in app and the isolated E2E database.
 *
 * **What is real and what is not.** Every import here is a row inserted
 * directly, in each state the pipeline can leave one in (`seedImport`): the
 * pipeline — S3, SQS, the preview and commit Lambdas — is not what is under
 * test and is never started. A fixture's storage key names no object and lies
 * outside the `imports/` prefix the bucket's upload trigger watches. Two things
 * follow, and they are deliberate:
 *
 *  - **Nothing here clicks Confirm, Retry Import or Save Correction.** Each of
 *    them puts a message on the real SQS queue. The pages that offer them are
 *    checked for what they *say* and what they *offer*; that Confirm and Retry
 *    refuse anyone but an Admin is held by the Server Action tests
 *    (`async-import-actions.test.ts`) and, in the database, by the service's
 *    own integration tests. Deciding a row (Skip, Approve Move) and publishing
 *    what an import drafted are database-only, and are clicked.
 *  - The one AWS call a spec can cause is the product's own: permanently
 *    deleting an archived import also asks S3, best effort, to delete its source
 *    file — here a `DeleteObject` of a made-up key, which removes nothing.
 *
 * Archiving, restoring and permanently deleting are `admin-mutation` writes
 * (30 / 60s) and deciding a row is another; publishing what an import drafted
 * is an `admin-publish` write (10 / 60s). They are real controls, never
 * relaxed: the spec spends from them through the shared account in
 * `support/rate-budget.ts` and waits out the window rather than tripping it —
 * except the last test, which trips the limit on purpose.
 */

const ADMIN_AUTH = "playwright/.auth/admin.json";
const LEARNER_AUTH = "playwright/.auth/learner.json";
const SHOTS = process.env.E2E_SHOTS_DIR;
const IMPORTS_API = "/api/v1/admin/imports";
const HISTORY = "/admin/curriculum/imports";
const ARCHIVED = "/admin/curriculum/imports/archived";
const COMMAND_PATH =
  /^\/api\/v1\/admin\/imports\/[^/]+\/(archive|restore|delete)$/;
/** How often the history reads itself again while the pipeline has work in hand (`IMPORT_REFRESH_MS`). Written here, not imported: a change must be noticed. */
const REFRESH_MS = 5_000;
const NO_ACCESS = "You don't have access to this part of the admin console.";

/**
 * A notice React Admin shows for a refused request. Found by role, never by text
 * alone: under `next dev` a refused data-provider call is also logged as a
 * console error, and Next's overlay keeps that error's text in the page (hidden,
 * in its own container) — so `getByText` can resolve to two elements and fail on
 * strictness although the person sees exactly one notice.
 */
const refusedNotice = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

const RUN = crypto.randomUUID().slice(0, 6);
/** Every file this run makes starts with this — so it finds, and removes, exactly its own. */
const TAG = `u8-${RUN}`;
const fileName = (name: string) => `${TAG}-${name}.csv`;

test.use({ storageState: ADMIN_AUTH });
// Waiting out a rate-limit window can take a minute; a cold `next dev` compile
// of a route can take another.
test.describe.configure({ mode: "serial", timeout: 180_000 });

let languageId = "";
/** Imports made by the running test. Removed after it, with the audit events that name them. */
let created: string[] = [];
/** Curriculum items made by the running test. */
let items: string[] = [];
/** What to undo once the imports are gone (a throwaway language cannot go while an import points at it). */
let afterwards: (() => Promise<void>)[] = [];

/**
 * What a test said it would spend, and what its page actually sent. A page that
 * sends more commands than the test budgeted would eat into the *next* test's
 * allowance, so it fails here instead of flaking there.
 */
let budgeted = 0;
let observed = 0;
let countResponse: ((response: Response) => void) | undefined;

test.beforeAll(async () => {
  ({ languageId } = await getE2EAdminScope());
  // Whatever an aborted earlier run left behind.
  await removeImportsNamed("u8-");
});
test.afterAll(async () => {
  await removeImportsNamed("u8-");
});

test.beforeEach(({ page }) => {
  budgeted = 0;
  observed = 0;
  countResponse = (response) => {
    const { pathname } = new URL(response.url());
    if (response.request().method() === "POST" && COMMAND_PATH.test(pathname))
      observed++;
  };
  page.on("response", countResponse);
});

test.afterEach(async ({ page }, testInfo) => {
  if (countResponse) page.off("response", countResponse);
  await setE2EAdminRole("admin");
  await removeSeededImports(created);
  created = [];
  await removeSeededItems(items);
  items = [];
  for (const undo of afterwards) await undo();
  afterwards = [];
  if (testInfo.status === testInfo.expectedStatus) {
    expect(
      observed,
      "the page sent more import commands than this test budgeted",
    ).toBeLessThanOrEqual(budgeted);
  }
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Budgets `count` archive / restore / delete requests the page will send. */
async function commands(count: number): Promise<void> {
  budgeted += count;
  await spendRateBudget("admin-mutation", count);
}

async function made(
  name: string,
  options: Omit<SeedImportOptions, "filename"> = {},
): Promise<E2EImport> {
  const record = await seedImport({ filename: fileName(name), ...options });
  created.push(record.id);
  return record;
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

const table = (page: Page, archived = false) =>
  page.getByRole("table", {
    name: archived ? "Archived imports" : "Import history",
  });
// `has` is evaluated inside each row, so its locator must start at the page —
// one chained from the table would look for a table inside a row.
const rowOf = (page: Page, filename: string, archived = false) =>
  table(page, archived)
    .getByRole("row")
    .filter({
      has: page.getByRole("link", { name: filename, exact: true }),
    });
const cellOf = (
  page: Page,
  filename: string,
  column: number,
  archived = false,
) => rowOf(page, filename, archived).getByRole("cell").nth(column);
const STATUS = 1;
const SUMMARY = 2;
const CREATED = 3;
const ARCHIVED_AT = 4;

const archiveButton = (page: Page, filename: string) =>
  page.getByRole("button", { name: `Archive ${filename}`, exact: true });
const restoreButton = (page: Page, filename: string) =>
  page.getByRole("button", { name: `Restore ${filename}`, exact: true });
const deleteButton = (page: Page, filename: string) =>
  page.getByRole("button", {
    name: `Permanently delete ${filename}`,
    exact: true,
  });

/** The files a list shows, in the order it shows them. */
const namesShown = (page: Page, archived = false) =>
  table(page, archived).locator("tbody tr td:first-child").allInnerTexts();

async function listReady(page: Page, archived = false): Promise<void> {
  await expect(
    page.getByRole("heading", {
      name: archived ? "Archived Imports" : "Curriculum Imports",
      level: 1,
    }),
  ).toBeVisible();
  // Whatever the list ends up showing: the table, or one of its empty states.
  // (The first visit to the route in a cold dev server compiles it, hence the room.)
  await expect(
    table(page, archived)
      .or(page.getByText("No imports yet"))
      .or(page.getByText("Nothing archived"))
      .or(page.getByText("There is nothing more on this page")),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("status")).toHaveCount(0);
}

async function openHistory(
  page: Page,
  options: { language?: string; archived?: boolean; cursor?: string } = {},
): Promise<void> {
  const query = new URLSearchParams({
    language: options.language ?? languageId,
  });
  if (options.cursor) query.set("cursor", options.cursor);
  await page.goto(
    `${options.archived ? ARCHIVED : HISTORY}?${query.toString()}`,
  );
  await listReady(page, options.archived);
}

const detailUrl = (id: string) => `${HISTORY}/${id}`;
const statusRegion = (page: Page) => page.getByRole("status");

async function openImport(page: Page, record: E2EImport): Promise<void> {
  await page.goto(detailUrl(record.id));
  await expect(
    page.getByRole("heading", { name: "Import", exact: true, level: 1 }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(record.filename, { exact: true })).toBeVisible();
  await expect(statusRegion(page)).toBeVisible();
}

const NOTICE_ARCHIVED = (name: string) =>
  `Archived “${name}”. It is under Archived now.`;
const NOTICE_RESTORED = (name: string) =>
  `Restored “${name}” to the import history.`;
const NOTICE_DELETED = (name: string) => `Permanently deleted “${name}”.`;

const dialogOf = (page: Page) =>
  page.getByRole("dialog", { name: "Permanently delete this import?" });
const typedWord = (dialog: Locator) =>
  dialog.getByRole("textbox", { name: "Type DELETE to continue" });
const submitOf = (dialog: Locator) =>
  dialog.getByRole("button", {
    name: /^(Permanently delete|Deleting…|Try again)$/,
  });

/**
 * Focus is held inside the dialog, so the keyboard cannot wander off behind it.
 * Where it *starts* differs by build — under `next dev`, React's Strict Mode
 * runs the dialog's focus trap twice and focus ends on the dialog itself; in a
 * production build it stays on the field that asked for it — so a test that
 * needs the field puts focus there itself.
 */
const focusIsInside = (page: Page) =>
  expect(page.locator('[role="dialog"]:focus-within')).toHaveCount(1);

/** Opens a row's delete dialog on the archived history. */
async function openDelete(page: Page, filename: string): Promise<Locator> {
  await deleteButton(page, filename).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

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

/** The headers a real page from this app attaches to a same-origin `fetch`. */
const fromThisApp = (origin: string, contentType = "application/json") => ({
  origin,
  "sec-fetch-site": "same-origin",
  "content-type": contentType,
});
const originOf = (baseURL: string | undefined) => new URL(baseURL!).origin;

const noHash = (page: Page) => expect(new URL(page.url()).hash).toBe("");

type Command = "archive" | "restore" | "delete";
const commandUrl = (id: string, command: Command) =>
  `${IMPORTS_API}/${id}/${command}`;
const bodyOf = (command: Command) =>
  command === "delete" ? { confirmation: "DELETE" } : {};
const COMMANDS: Command[] = ["archive", "restore", "delete"];

async function readPage(page: Page, query: string): Promise<AdminImportPage> {
  const response = await page.request.get(`${IMPORTS_API}?${query}`);
  expect(response.status(), query).toBe(200);
  return (await response.json()).data as AdminImportPage;
}

const sameInstant = (a: Date | null, b: Date | null) =>
  expect(a?.toISOString() ?? null).toBe(b?.toISOString() ?? null);

/** The rows of a preview that needs review: one fine, one to update, one blocked, one move. */
const REVIEW_ROWS: SeedImportRow[] = [
  { rowNumber: 1, displayTerm: "gato", classification: "create" },
  { rowNumber: 2, displayTerm: "perro", classification: "update" },
  {
    rowNumber: 3,
    displayTerm: "pajaro",
    classification: "blocked",
    levelNumber: 99,
    reviewReason: "Level 99 does not exist.",
  },
  {
    rowNumber: 4,
    displayTerm: "casa",
    classification: "move",
    levelNumber: 2,
    reviewReason: "Moves from level 1 to level 2.",
  },
];
const NEEDS_REVIEW = {
  totalRows: 4,
  createCount: 1,
  updateCount: 1,
  moveCount: 1,
  unchangedCount: 0,
  reviewCount: 2,
} as const;

/* -------------------------------------------------------------------------- */
/* The history                                                                */
/* -------------------------------------------------------------------------- */

test.describe("the history", () => {
  test("shows an import in every status — where it is, what it found, and when — newest first, matching the database — and is reached from the sidebar", async ({
    page,
  }) => {
    const now = Date.now();
    const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000);
    // Until an import has *completed* its counts are the preview's — what it
    // would do — and are worded that way; before the preview there is nothing
    // to count, and saying "0 to create" would be a claim.
    const reviewable = {
      totalRows: 40,
      createCount: 30,
      updateCount: 6,
      moveCount: 2,
      unchangedCount: 2,
    };
    const everyStatus: {
      name: string;
      options: Omit<SeedImportOptions, "filename">;
      badge: string;
      stage: string | null;
      summary: string;
    }[] = [
      {
        name: "uploading",
        options: { status: "uploading" },
        badge: "Processing",
        stage: "Uploading the file",
        summary: "Not counted yet",
      },
      {
        name: "queued-for-preview",
        options: { status: "queued_for_preview" },
        badge: "Processing",
        stage: "Waiting to validate",
        summary: "Not counted yet",
      },
      {
        name: "previewing",
        options: { status: "previewing" },
        badge: "Processing",
        stage: "Validating rows",
        summary: "Not counted yet",
      },
      {
        name: "needs-review",
        options: { status: "needs_review", ...reviewable, reviewCount: 3 },
        badge: "Needs review",
        stage: "Rows need a decision",
        summary:
          "40 rows · 3 need review · 30 to create · 6 to update · 2 to move",
      },
      {
        name: "ready",
        options: { status: "ready_to_import", ...reviewable },
        badge: "Ready to import",
        stage: "Waiting for confirmation",
        summary: "40 rows · 30 to create · 6 to update · 2 to move",
      },
      {
        name: "queued-for-import",
        options: { status: "queued_for_import", ...reviewable },
        badge: "Processing",
        stage: "Waiting to import",
        summary: "40 rows · 30 to create · 6 to update · 2 to move",
      },
      {
        name: "importing",
        options: { status: "importing", ...reviewable },
        badge: "Processing",
        stage: "Importing",
        summary: "40 rows · 30 to create · 6 to update · 2 to move",
      },
      {
        name: "completed",
        options: {
          status: "completed",
          totalRows: 61,
          createCount: 43,
          updateCount: 8,
          moveCount: 2,
          unchangedCount: 6,
          skippedCount: 2,
        },
        badge: "Completed",
        stage: null,
        summary: "61 rows · 43 created · 8 updated · 2 moved · 2 skipped",
      },
      {
        name: "failed",
        options: {
          status: "failed",
          totalRows: 12,
          createCount: 12,
          attemptCount: 3,
          lastErrorCode: "COMMIT_FAILED",
          lastErrorSummary: "The commit job stopped.",
        },
        badge: "Failed",
        stage: null,
        summary:
          "12 rows · 12 to create · 0 to update · 0 to move · 3 attempts",
      },
    ];
    const records: E2EImport[] = [];
    for (const [index, entry] of everyStatus.entries()) {
      records.push(
        await made(entry.name, {
          ...entry.options,
          // The first is the newest.
          createdAt: minutesAgo(index + 1),
        }),
      );
    }

    await page.goto("/admin");
    const link = page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name: "Imports", exact: true });
    await expect(link).toBeVisible();
    await expect(link).not.toHaveAttribute("aria-current", "page");
    await link.click();
    await listReady(page);
    await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
    await expect(page).toHaveTitle("Curriculum Imports — Polyglot Admin");
    await expect(link).toHaveAttribute("aria-current", "page");

    expect(await table(page).getByRole("columnheader").allInnerTexts()).toEqual(
      ["File", "Status", "Summary", "Created", "Actions"],
    );
    // Newest first: the order is the database's, not the browser's.
    const inDatabase = await getE2EImportsTagged(TAG);
    expect(inDatabase.map((record) => record.filename)).toEqual(
      records.map((record) => record.filename),
    );
    await expect
      .poll(() => namesShown(page))
      .toEqual(inDatabase.map((record) => record.filename));

    for (const [index, entry] of everyStatus.entries()) {
      const record = records[index]!;
      const stored = inDatabase[index]!;
      expect(stored.status, entry.name).toBe(entry.options.status);
      const status = cellOf(page, record.filename, STATUS);
      await expect(status, entry.name).toContainText(entry.badge);
      if (entry.stage)
        await expect(status, entry.name).toContainText(entry.stage);
      else await expect(status, entry.name).toHaveText(entry.badge);
      await expect(
        cellOf(page, record.filename, SUMMARY),
        entry.name,
      ).toHaveText(entry.summary);
      const when = await cellOf(page, record.filename, CREATED)
        .locator("time")
        .getAttribute("datetime");
      expect(when!.slice(0, 23), entry.name).toBe(
        stored.createdAt.toISOString().slice(0, 23),
      );
      // Each file is the way into that import's own page.
      await expect(
        rowOf(page, record.filename).getByRole("link", {
          name: record.filename,
          exact: true,
        }),
      ).toHaveAttribute("href", detailUrl(record.id));
    }

    // An Admin can act on every one — and only in the one way the normal history offers.
    await expect(page.getByRole("button", { name: /^Archive / })).toHaveCount(
      everyStatus.length,
    );
    await expect(page.getByRole("button", { name: /^Restore / })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /^Permanently delete / }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "New Import", exact: true }),
    ).toHaveAttribute("href", `${HISTORY}/new?language=${languageId}`);
    await expect(
      page.getByRole("link", { name: "Archived", exact: true }),
    ).toHaveAttribute("href", `${ARCHIVED}?language=${languageId}`);
    await noHash(page);
    await shot(page, "imports-list-light");
  });

  test("exposes nothing private — no storage location, checksum, uploader or error text — in the page or in the API; the import's own page is where an error is read", async ({
    page,
  }) => {
    const secret = `private-${RUN}: could not read s3://private-bucket/key`;
    const failed = await made("secret", {
      status: "failed",
      totalRows: 5,
      createCount: 5,
      attemptCount: 2,
      lastErrorCode: "COMMIT_FAILED",
      lastErrorSummary: secret,
    });
    await made("plain", { status: "completed", totalRows: 2, createCount: 2 });
    const adminId = await getE2EAdminUserId();

    await openHistory(page);
    await expect(rowOf(page, failed.filename)).toBeVisible();
    const html = await page.content();

    await renewSession(page);
    const response = await page.request.get(
      `${IMPORTS_API}?language=${languageId}`,
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
    const mine = (data.items as { originalFilename: string }[]).filter((row) =>
      row.originalFilename.startsWith(TAG),
    );
    expect(mine).toHaveLength(2);
    for (const item of data.items) {
      expect(Object.keys(item).sort()).toEqual([
        "archivedAt",
        "attemptCount",
        "createCount",
        "createdAt",
        "id",
        "moveCount",
        "originalFilename",
        "reviewCount",
        "skippedCount",
        "status",
        "totalRows",
        "unchangedCount",
        "updateCount",
      ]);
    }
    for (const leaked of [
      secret,
      "private-bucket",
      "e2e-fixture",
      "COMMIT_FAILED",
      failed.s3Key,
      adminId,
    ]) {
      expect(text, `the API leaked ${leaked}`).not.toContain(leaked);
      expect(html, `the page leaked ${leaked}`).not.toContain(leaked);
    }
    for (const word of [
      "s3key",
      "s3bucket",
      "sha256",
      "uploadedby",
      "lasterror",
    ]) {
      expect(text.toLowerCase(), `the API mentions "${word}"`).not.toContain(
        word,
      );
    }

    // The import's own page is for someone who may act on it, and says what went wrong.
    await openImport(page, failed);
    await expect(
      page.getByText("Import failed (COMMIT_FAILED) after 2 attempts."),
    ).toBeVisible();
    await expect(page.getByText(secret)).toBeVisible();
  });

  test("pages through the history in order, with none repeated and none missed — even when every import was made at one instant", async ({
    page,
  }) => {
    const tag = `${TAG}-bulk`;
    const total = IMPORT_LIST_PAGE_SIZE + 5;
    created.push(...(await seedManyImports(tag, total)));
    const inDatabase = await getE2EImportsTagged(tag);
    expect(inDatabase).toHaveLength(total);
    // One statement, one instant, to the microsecond: the order is the id's,
    // and a cursor that rounded the instant to the millisecond would lose rows.
    expect(
      new Set(inDatabase.map((record) => record.createdAt.getTime())).size,
    ).toBe(1);
    const names = inDatabase.map((record) => record.filename);
    const firstPage = names.slice(0, IMPORT_LIST_PAGE_SIZE);
    const secondPage = names.slice(IMPORT_LIST_PAGE_SIZE);

    await openHistory(page);
    await expect.poll(() => namesShown(page)).toEqual(firstPage);
    const next = page.getByRole("button", { name: "Next page" });
    const previous = page.getByRole("button", { name: "Previous page" });
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expect.poll(() => namesShown(page)).toEqual(secondPage);
    expect(new URL(page.url()).searchParams.get("cursor")).toBeTruthy();
    expect(new URL(page.url()).searchParams.get("language")).toBe(languageId);
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
    await shot(page, "imports-list-page-two");

    // The address alone brings the second page back — and the way back from it.
    await page.reload();
    await listReady(page);
    await expect.poll(() => namesShown(page)).toEqual(secondPage);
    await expect(previous).toBeEnabled();

    await previous.click();
    await expect.poll(() => namesShown(page)).toEqual(firstPage);
    expect(new URL(page.url()).searchParams.get("cursor")).toBeNull();
    // Together: exactly the database's imports, once each.
    expect([...firstPage, ...secondPage]).toEqual(names);
  });

  test("says so, in its own words, in each of its empty states — nothing yet, nothing archived, and a page whose rows have gone", async ({
    page,
  }) => {
    const empty = await seedEmptyLanguage();
    afterwards.push(empty.remove);

    await openHistory(page, { language: empty.languageId });
    await expect(page.getByText("No imports yet")).toBeVisible();
    await expect(
      page.getByText("Start one with New Import above."),
    ).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    await shot(page, "imports-list-empty");

    await openHistory(page, { language: empty.languageId, archived: true });
    await expect(page.getByText("Nothing archived")).toBeVisible();
    await expect(
      page.getByText("Archived imports will show up here."),
    ).toBeVisible();

    // A cursor that points past the end is not "no imports": it is a page
    // whose rows have gone, and it has a way back.
    const tag = `${TAG}-gone`;
    created.push(...(await seedManyImports(tag, IMPORT_LIST_PAGE_SIZE + 5)));
    const inDatabase = await getE2EImportsTagged(tag);
    await openHistory(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect
      .poll(() => namesShown(page))
      .toEqual(
        inDatabase
          .slice(IMPORT_LIST_PAGE_SIZE)
          .map((record) => record.filename),
      );
    await removeSeededImports(
      inDatabase.slice(IMPORT_LIST_PAGE_SIZE).map((record) => record.id),
    );
    await page.reload();
    await listReady(page);
    await expect(
      page.getByText("There is nothing more on this page"),
    ).toBeVisible();
    await expect(page.getByText("No imports yet")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Previous page" }),
    ).toBeEnabled();
    await shot(page, "imports-list-past-the-end");
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect
      .poll(() => namesShown(page))
      .toEqual(
        inDatabase
          .slice(0, IMPORT_LIST_PAGE_SIZE)
          .map((record) => record.filename),
      );
    expect(new URL(page.url()).searchParams.get("cursor")).toBeNull();
  });

  test("keeps the archived history apart from the normal one — each lists only its own, with its own actions", async ({
    page,
  }) => {
    const live = await made("live", { status: "completed", totalRows: 3 });
    const old = await made("old", {
      status: "completed",
      totalRows: 9,
      createCount: 9,
      archived: true,
    });

    await openHistory(page);
    await expect(rowOf(page, live.filename)).toBeVisible();
    await expect(rowOf(page, old.filename)).toHaveCount(0);
    await page.getByRole("link", { name: "Archived", exact: true }).click();
    await listReady(page, true);
    await expect(page).toHaveURL(
      new RegExp(`${ARCHIVED}\\?language=${languageId}`),
    );
    await expect(page).toHaveTitle("Archived Imports — Polyglot Admin");

    await expect(rowOf(page, old.filename, true)).toBeVisible();
    await expect(rowOf(page, live.filename, true)).toHaveCount(0);
    expect(
      await table(page, true).getByRole("columnheader").allInnerTexts(),
    ).toEqual(["File", "Status", "Summary", "Created", "Archived", "Actions"]);
    const stored = (await getE2EImport(old.id))!;
    const archivedAt = await cellOf(page, old.filename, ARCHIVED_AT, true)
      .locator("time")
      .getAttribute("datetime");
    expect(archivedAt!.slice(0, 23)).toBe(
      stored.archivedAt!.toISOString().slice(0, 23),
    );
    await expect(cellOf(page, old.filename, SUMMARY, true)).toHaveText(
      "9 rows · 9 created · 0 updated · 0 moved",
    );
    // Here the commands are Restore and Permanently delete — never Archive.
    await expect(restoreButton(page, old.filename)).toBeVisible();
    await expect(deleteButton(page, old.filename)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Archive / })).toHaveCount(
      0,
    );
    await shot(page, "imports-archived-light");

    await page.getByRole("link", { name: "Back to history" }).click();
    await listReady(page);
    await expect(page).toHaveURL(
      new RegExp(`${HISTORY}\\?language=${languageId}`),
    );
    await expect(rowOf(page, live.filename)).toBeVisible();
    await noHash(page);
  });

  test("shows one language's history at a time — the switch appears only when there is a choice, and never mixes them", async ({
    page,
  }) => {
    const mine = await made("mine");
    await openHistory(page);
    // One language: nothing to switch.
    await expect(page.getByRole("combobox", { name: /Language/ })).toHaveCount(
      0,
    );

    const other = await seedEmptyLanguage();
    afterwards.push(other.remove);
    const theirs = await seedImport({
      filename: fileName("theirs"),
      languageId: other.languageId,
    });
    created.push(theirs.id);

    await openHistory(page);
    await expect(rowOf(page, mine.filename)).toBeVisible();
    await expect(page.getByRole("link", { name: theirs.filename })).toHaveCount(
      0,
    );

    await page.getByRole("combobox", { name: /Language/ }).click();
    await page
      .getByRole("option")
      .filter({ hasText: /^E2E Empty/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`language=${other.languageId}`));
    await expect(page).not.toHaveURL(/cursor=/);
    await expect(rowOf(page, theirs.filename)).toBeVisible();
    await expect(page.getByRole("link", { name: mine.filename })).toHaveCount(
      0,
    );
    // The header's links follow the language being looked at.
    await expect(
      page.getByRole("link", { name: "Archived", exact: true }),
    ).toHaveAttribute("href", `${ARCHIVED}?language=${other.languageId}`);
    await expect(
      page.getByRole("link", { name: "New Import", exact: true }),
    ).toHaveAttribute("href", `${HISTORY}/new?language=${other.languageId}`);
    await noHash(page);

    // The API says the same: each language's page holds only its own.
    await renewSession(page);
    const here = await readPage(page, `language=${languageId}`);
    const there = await readPage(page, `language=${other.languageId}`);
    expect(here.items.map((row) => row.id)).toContain(mine.id);
    expect(here.items.map((row) => row.id)).not.toContain(theirs.id);
    expect(there.items.map((row) => row.id)).toEqual([theirs.id]);
    // And a language that does not exist is not an empty history.
    const unknown = await page.request.get(
      `${IMPORTS_API}?language=11111111-1111-4111-8111-111111111111`,
    );
    expect(unknown.status()).toBe(404);
  });

  test("reads itself again while an import is being worked on — Processing becomes Needs review with no reload — and stops asking once nothing is moving", async ({
    page,
  }) => {
    const working = await made("working", { status: "previewing" });
    const listReads: string[] = [];
    page.on("request", (request: Request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === IMPORTS_API
      )
        listReads.push(request.url());
    });

    await openHistory(page);
    await page.evaluate(() => {
      (window as unknown as { kept: string }).kept = "the same page";
    });
    const status = cellOf(page, working.filename, STATUS);
    await expect(status).toContainText("Validating rows");

    // The preview finishes, as the pipeline would leave it.
    await advanceE2EImport(working.id, {
      status: "needs_review",
      totalRows: 5,
      createCount: 3,
      updateCount: 1,
      moveCount: 1,
      reviewCount: 2,
      previewVersion: 1,
    });
    await expect(status).toContainText("Needs review", {
      timeout: REFRESH_MS * 4,
    });
    await expect(status).toContainText("Rows need a decision");
    await expect(cellOf(page, working.filename, SUMMARY)).toHaveText(
      "5 rows · 2 need review · 3 to create · 1 to update · 1 to move",
    );
    // It was the list asking again, not the page starting over.
    expect(
      await page.evaluate(() => (window as unknown as { kept?: string }).kept),
    ).toBe("the same page");

    // Nothing is moving now (it waits for a person), so nothing asks again.
    // Only time can show that something does not happen: two intervals' worth.
    const seen = listReads.length;
    expect(seen).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(REFRESH_MS * 2 + 1_000);
    expect(listReads.length).toBe(seen);
  });
});

/* -------------------------------------------------------------------------- */
/* An import's own page                                                       */
/* -------------------------------------------------------------------------- */

test.describe("an import's own page", () => {
  test("is where each file leads — and has the way back to the history", async ({
    page,
  }) => {
    const record = await made("lead", {
      status: "completed",
      totalRows: 3,
      createCount: 3,
    });
    await openHistory(page);
    await rowOf(page, record.filename)
      .getByRole("link", { name: record.filename, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${detailUrl(record.id)}$`));
    await expect(page).toHaveTitle("Import Status — Polyglot Admin");
    await expect(
      page.getByRole("heading", { name: "Import", exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText(record.filename, { exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "← Back to Imports" }).click();
    await listReady(page);
    await expect(page).toHaveURL(new RegExp(`${HISTORY}$`));
    await expect(rowOf(page, record.filename)).toBeVisible();

    // An import that is not there is not found.
    const missing = await page.goto(
      detailUrl("22222222-2222-4222-8222-222222222222"),
    );
    expect(missing?.status()).toBe(404);
  });

  test("says what each stage of the pipeline is while it works — and offers nothing to do yet", async ({
    page,
  }) => {
    const stages: {
      status: SeedImportOptions["status"];
      message: string;
      stage: string;
    }[] = [
      {
        status: "uploading",
        message: "Uploading curriculum…",
        stage: "Uploading the file",
      },
      {
        status: "queued_for_preview",
        message:
          "Validating curriculum… The import is running in the background. You may leave this page.",
        stage: "Waiting to validate",
      },
      {
        status: "previewing",
        message:
          "Validating curriculum… The import is running in the background. You may leave this page.",
        stage: "Validating rows",
      },
      {
        status: "queued_for_import",
        message: "Importing… Applying the approved curriculum rows.",
        stage: "Waiting to import",
      },
      {
        status: "importing",
        message: "Importing… Applying the approved curriculum rows.",
        stage: "Importing",
      },
    ];
    for (const entry of stages) {
      const record = await made(`stage-${entry.status}`, {
        status: entry.status,
        ...NEEDS_REVIEW,
      });
      await openImport(page, record);
      await expect(
        page.getByText(entry.message, { exact: true }),
      ).toBeVisible();
      const region = statusRegion(page);
      await expect(region).toContainText("Processing");
      await expect(region).toContainText(entry.stage);
      // Nothing to decide, confirm or retry while it works.
      await expect(
        page.getByRole("button", { name: /Confirm Import|Retry Import/ }),
      ).toHaveCount(0);
    }
  });

  test("lists the rows that need a decision, holds Confirm back until each has one, and records a decision without applying anything", async ({
    page,
  }) => {
    await spendRateBudget("admin-mutation", 2);
    const record = await made("review", {
      status: "needs_review",
      ...NEEDS_REVIEW,
    });
    await seedImportRows(record.id, REVIEW_ROWS);
    const before = (await getE2EImport(record.id))!;
    const curriculumBefore = await getE2EAdminStatusCounts();

    await openImport(page, record);
    await expect(statusRegion(page)).toContainText("Needs review");
    await expect(statusRegion(page)).toContainText("Rows need a decision");
    await expect(
      page.getByText(
        "4 rows — 1 create, 1 update, 1 move, 0 unchanged, 2 needs review.",
      ),
    ).toBeVisible();
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(REVIEW_ROWS.length + 1);
    const rowFor = (term: string) =>
      rows.filter({ has: page.getByRole("cell", { name: term, exact: true }) });
    await expect(rowFor("gato")).toContainText("New");
    await expect(rowFor("perro")).toContainText("Update");
    await expect(rowFor("pajaro")).toContainText("Needs review");
    await expect(rowFor("pajaro")).toContainText("Level 99 does not exist.");
    await expect(rowFor("casa")).toContainText("Move — Needs Approval");
    // Only the rows that need a decision offer one.
    await expect(rowFor("gato").getByRole("button")).toHaveCount(0);
    await expect(rowFor("pajaro").getByRole("button")).toHaveText([
      "Fix Row",
      "Skip",
    ]);
    await expect(rowFor("casa").getByRole("button")).toHaveText([
      "Approve Move",
      "Fix Row",
      "Skip",
    ]);

    const confirm = page.getByRole("button", { name: "Confirm Import" });
    await expect(confirm).toBeDisabled();
    await expect(page.getByText("2 rows still need a decision.")).toBeVisible();
    await shot(page, "import-needs-review-light");

    // Skip one: one decision left.
    await rowFor("pajaro").getByRole("button", { name: "Skip" }).click();
    await expect(rowFor("pajaro")).toContainText("Skipped");
    await expect(page.getByText("1 row still needs a decision.")).toBeVisible();
    await expect(confirm).toBeDisabled();
    // A move is never applied silently: it takes an explicit approval.
    await rowFor("casa").getByRole("button", { name: "Approve Move" }).click();
    await expect(rowFor("casa")).toContainText("Move Approved");
    await expect(page.getByText(/still needs? a decision/)).toHaveCount(0);
    await expect(confirm).toBeEnabled();

    // The decisions are in the database — and nothing else moved. The import
    // is still waiting for confirmation, and no curriculum changed.
    expect(await getE2EImportRowDispositions(record.id)).toEqual([
      { rowNumber: 1, adminDisposition: null },
      { rowNumber: 2, adminDisposition: null },
      { rowNumber: 3, adminDisposition: "skip" },
      { rowNumber: 4, adminDisposition: "approve_move" },
    ]);
    const after = (await getE2EImport(record.id))!;
    expect(after.status).toBe("needs_review");
    expect(after.confirmedAt).toBeNull();
    expect(after.confirmedPreviewVersion).toBeNull();
    sameInstant(after.updatedAt, before.updatedAt);
    expect(
      await countE2EImportAudits("CURRICULUM_IMPORT_CONFIRMED", record.id),
    ).toBe(0);
    expect(await getE2EAdminStatusCounts()).toEqual(curriculumBefore);

    // The decisions survive a reload: the page asks the database, not its memory.
    await page.reload();
    await expect(rowFor("pajaro")).toContainText("Skipped");
    await expect(rowFor("casa")).toContainText("Move Approved");
    await expect(confirm).toBeEnabled();
  });

  test("offers Confirm on an import that is ready — once every decision has been made", async ({
    page,
  }) => {
    const record = await made("ready", {
      status: "ready_to_import",
      ...NEEDS_REVIEW,
    });
    await seedImportRows(
      record.id,
      REVIEW_ROWS.map((row) =>
        row.classification === "blocked"
          ? { ...row, adminDisposition: "skip" as const }
          : row.classification === "move"
            ? { ...row, adminDisposition: "approve_move" as const }
            : row,
      ),
    );

    await openImport(page, record);
    await expect(statusRegion(page)).toContainText("Ready to import");
    await expect(statusRegion(page)).toContainText("Waiting for confirmation");
    await expect(
      page.getByRole("table").getByRole("cell", { name: "Skipped" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table").getByRole("cell", { name: "Move Approved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Confirm Import" }),
    ).toBeEnabled();
    await expect(page.getByText(/still needs? a decision/)).toHaveCount(0);
    // Offered, and left alone: confirming puts a message on the real queue.
    expect((await getE2EImport(record.id))!.status).toBe("ready_to_import");
  });

  test("says what a completed import did — and that what it created is Pending, not live", async ({
    page,
  }) => {
    const record = await made("done", {
      status: "completed",
      totalRows: 61,
      createCount: 43,
      updateCount: 8,
      moveCount: 2,
      unchangedCount: 6,
      skippedCount: 2,
      draftedItemIds: [],
    });
    await openImport(page, record);
    await expect(statusRegion(page)).toContainText("Completed");
    await expect(page.getByText("Import complete.")).toBeVisible();
    await expect(
      page.getByText(
        "61 rows processed — 43 created, 8 updated, 2 moved, 6 unchanged, 2 skipped. All newly created content is Pending.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View curriculum" }),
    ).toHaveAttribute("href", "/admin/curriculum");
    // Nothing it drafted, so nothing to publish.
    await expect(
      page.getByRole("button", { name: /Publish All Eligible/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    await shot(page, "import-completed-light");
  });

  test("says what a failed import ran into — and offers a retry, which this test leaves alone", async ({
    page,
  }) => {
    const record = await made("failed", {
      status: "failed",
      totalRows: 12,
      createCount: 12,
      attemptCount: 3,
      lastErrorCode: "COMMIT_FAILED",
      lastErrorSummary: `The commit job stopped (${RUN}).`,
    });
    const once = await made("failed-once", {
      status: "failed",
      attemptCount: 1,
      lastErrorCode: null,
      lastErrorSummary: null,
    });

    await openImport(page, record);
    await expect(statusRegion(page)).toContainText("Failed");
    await expect(
      page.getByText("Import failed (COMMIT_FAILED) after 3 attempts."),
    ).toBeVisible();
    await expect(
      page.getByText(`The commit job stopped (${RUN}).`),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry Import" }),
    ).toBeEnabled();
    await shot(page, "import-failed-light");

    // One attempt is "1 attempt", and no code is not an empty pair of brackets.
    await openImport(page, once);
    await expect(
      page.getByText("Import failed after 1 attempt."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry Import" }),
    ).toBeVisible();

    // Retrying puts a message on the real queue, so it is never pressed here;
    // looking at the page changed nothing.
    for (const untouched of [record, once]) {
      const stored = (await getE2EImport(untouched.id))!;
      expect(stored.status).toBe("failed");
      expect(stored.attemptCount).toBe(untouched.attemptCount);
    }
  });

  test("follows the pipeline — when the preview finishes, the page shows the rows to review, with no reload — and stops asking once a person has the next move", async ({
    page,
  }) => {
    const record = await made("follow", { status: "previewing" });
    await seedImportRows(record.id, REVIEW_ROWS);
    const polls: Request[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] !== undefined &&
        new URL(request.url()).pathname === detailUrl(record.id)
      )
        polls.push(request);
    });

    await openImport(page, record);
    await expect(statusRegion(page)).toContainText("Validating rows");
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { kept: string }).kept = "the same page";
    });

    await advanceE2EImport(record.id, {
      status: "needs_review",
      ...NEEDS_REVIEW,
      previewVersion: 1,
    });
    await expect(statusRegion(page)).toContainText("Rows need a decision", {
      timeout: 20_000,
    });
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(
      REVIEW_ROWS.length + 1,
    );
    await expect(
      page.getByRole("button", { name: "Confirm Import" }),
    ).toBeDisabled();
    await expect(page.getByText("2 rows still need a decision.")).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { kept?: string }).kept),
    ).toBe("the same page");

    // Waiting for a person now: no more polling. Only time shows an absence.
    const seen = polls.length;
    await page.waitForTimeout(7_000);
    expect(polls.length).toBe(seen);
  });

  test("keeps what an import drafted out of the live curriculum until an Admin publishes it — and says what it did when it does", async ({
    page,
  }) => {
    await spendRateBudget("admin-publish", 1);
    const drafted = await seedItemWithDraft(
      `${TAG}-drafted`,
      "the imported meaning",
    );
    const [alreadyLive] = await seedExtraVocabulary([`${TAG}-nodraft`]);
    items.push(drafted.id, alreadyLive!);
    const record = await made("drafted", {
      status: "completed",
      totalRows: 2,
      updateCount: 2,
      draftedItemIds: [drafted.id, alreadyLive!],
    });

    // The import has committed, and what it changed in a published item waits in a draft.
    const live = await getE2EItemState(drafted.id);
    expect(live).toMatchObject({
      status: "published",
      primaryMeaning: drafted.liveMeaning,
      hasDraft: true,
    });

    await openImport(page, record);
    await expect(
      page.getByText("2 published items now have draft changes."),
    ).toBeVisible();
    const publish = page.getByRole("button", {
      name: "Publish All Eligible Imported Changes",
    });
    await expect(publish).toBeEnabled();
    await shot(page, "import-drafts-light");
    // Looking at it, and leaving it, publishes nothing.
    await page.reload();
    await expect(publish).toBeVisible();
    expect(await getE2EItemState(drafted.id)).toEqual(live);
    expect(await countE2EPublishAudits(drafted.id)).toBe(0);

    await publish.click();
    // Partial is the normal result: one had a draft, one no longer did.
    await expect(
      page.getByText("Published 1 item; 1 no longer had a draft to publish."),
    ).toBeVisible();
    await expect(publish).toHaveCount(0);

    expect(await getE2EItemState(drafted.id)).toMatchObject({
      status: "published",
      primaryMeaning: "the imported meaning",
      hasDraft: false,
    });
    expect(await countE2EPublishAudits(drafted.id)).toBe(1);
    expect(await countE2EPublishAudits(alreadyLive!)).toBe(0);
    // The import itself is as it was: publishing is a separate act from importing.
    const stored = (await getE2EImport(record.id))!;
    expect(stored.status).toBe("completed");
    expect(stored.draftedItemIds).toEqual([drafted.id, alreadyLive!]);
  });
});

/* -------------------------------------------------------------------------- */
/* Archiving, restoring and deleting                                          */
/* -------------------------------------------------------------------------- */

test.describe("archiving, restoring and deleting", () => {
  test("archives an import in one click and says so — the row moves to the archived history, the database and audit trail agree, and the import and curriculum are untouched", async ({
    page,
  }) => {
    await commands(1);
    const target = await made("archive", {
      status: "needs_review",
      ...NEEDS_REVIEW,
    });
    await seedImportRows(target.id, REVIEW_ROWS);
    const bystander = await made("bystander", { status: "completed" });
    const adminId = await getE2EAdminUserId();
    const curriculumBefore = await getE2EAdminStatusCounts();
    const rowsBefore = await countE2EImportRows(target.id);

    await openHistory(page);
    await archiveButton(page, target.filename).click();
    await expect(
      page.getByText(NOTICE_ARCHIVED(target.filename)),
    ).toBeVisible();
    await expect(rowOf(page, target.filename)).toHaveCount(0);
    await expect(rowOf(page, bystander.filename)).toBeVisible();
    await shot(page, "imports-list-archived-notice");

    const stored = (await getE2EImport(target.id))!;
    expect(stored.archivedAt).not.toBeNull();
    expect(stored.archivedByUserId).toBe(adminId);
    // Archiving files an import away; it neither applies nor discards it.
    expect(stored.status).toBe("needs_review");
    expect(stored.previewVersion).toBe(target.previewVersion);
    expect(await countE2EImportRows(target.id)).toBe(rowsBefore);
    expect(await getE2EImportAuditActions(target.id)).toEqual([
      "CURRICULUM_IMPORT_ARCHIVED",
    ]);
    expect((await getE2EImport(bystander.id))!.archivedAt).toBeNull();
    expect(await getE2EAdminStatusCounts()).toEqual(curriculumBefore);

    // It is now in the archived history, and not in the normal one.
    await page.getByRole("link", { name: "Archived", exact: true }).click();
    await listReady(page, true);
    await expect(rowOf(page, target.filename, true)).toBeVisible();
    await expect(cellOf(page, target.filename, STATUS, true)).toContainText(
      "Needs review",
    );
  });

  test("restores an archived import to the history, and says so — and restoring one that is not archived changes nothing", async ({
    page,
    baseURL,
  }) => {
    await commands(3);
    const target = await made("restore", {
      status: "completed",
      totalRows: 4,
      createCount: 4,
      archived: true,
    });

    await openHistory(page, { archived: true });
    await restoreButton(page, target.filename).click();
    await expect(
      page.getByText(NOTICE_RESTORED(target.filename)),
    ).toBeVisible();
    await expect(rowOf(page, target.filename, true)).toHaveCount(0);
    await expect(page.getByText("Nothing archived")).toBeVisible();

    const stored = (await getE2EImport(target.id))!;
    expect(stored.archivedAt).toBeNull();
    expect(stored.archivedByUserId).toBeNull();
    expect(stored.status).toBe("completed");
    expect(await getE2EImportAuditActions(target.id)).toEqual([
      "CURRICULUM_IMPORT_RESTORED",
    ]);
    await page.getByRole("link", { name: "Back to history" }).click();
    await listReady(page);
    await expect(rowOf(page, target.filename)).toBeVisible();

    // Restoring what is not archived is a no-op, not an error and not a second event.
    const again = await page.request.post(commandUrl(target.id, "restore"), {
      headers: fromThisApp(originOf(baseURL)),
      data: {},
    });
    expect(again.status()).toBe(200);
    expect((await again.json()).data).toEqual({ importId: target.id });
    expect(await getE2EImportAuditActions(target.id)).toEqual([
      "CURRICULUM_IMPORT_RESTORED",
    ]);
    // Archive and restore are a pair: back where it started.
    const archivedAgain = await page.request.post(
      commandUrl(target.id, "archive"),
      { headers: fromThisApp(originOf(baseURL)), data: {} },
    );
    expect(archivedAgain.status()).toBe(200);
    expect((await getE2EImport(target.id))!.archivedAt).not.toBeNull();
  });

  test("asks before it permanently deletes — the button waits for the exact word — and only then removes the import's history, leaving the curriculum alone", async ({
    page,
  }) => {
    await commands(1);
    const drafted = await seedItemWithDraft(
      `${TAG}-kept`,
      "the drafted meaning",
    );
    items.push(drafted.id);
    const target = await made("delete", {
      status: "completed",
      totalRows: 7,
      createCount: 7,
      draftedItemIds: [drafted.id],
      archived: true,
    });
    await seedImportRows(target.id, REVIEW_ROWS);
    expect(await countE2EImportRows(target.id)).toBe(REVIEW_ROWS.length);
    const curriculumBefore = await getE2EAdminStatusCounts();
    const itemBefore = await getE2EItemState(drafted.id);

    await openHistory(page, { archived: true });
    const dialog = await openDelete(page, target.filename);
    await expect(
      dialog.getByText(
        "This removes the import record, stored row results, and remaining source file. This does not undo curriculum changes made by the import.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByText(target.filename, { exact: true }),
    ).toBeVisible();
    await focusIsInside(page);
    const confirm = submitOf(dialog);
    await expect(confirm).toBeDisabled();
    await shot(page, "imports-delete-dialog-light");

    // Close, but not exact: case matters, and so does the space.
    for (const wrong of [
      "delete",
      "Delete",
      "DELET",
      "DELETE ",
      " DELETE",
      "DELETED",
    ]) {
      await typedWord(dialog).fill(wrong);
      await expect(confirm, `"${wrong}"`).toBeDisabled();
    }
    // Pressing Enter in the field does not get round it.
    await typedWord(dialog).fill("delete");
    await typedWord(dialog).press("Enter");
    await expect(dialog).toBeVisible();
    expect(observed).toBe(0);

    // Cancelling sends nothing and keeps everything.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    expect(observed).toBe(0);
    expect(await getE2EImport(target.id)).not.toBeNull();

    // Opened again it starts empty: nothing typed before is remembered.
    const again = await openDelete(page, target.filename);
    await expect(typedWord(again)).toHaveValue("");
    await expect(submitOf(again)).toBeDisabled();
    await typedWord(again).fill("DELETE");
    await expect(submitOf(again)).toBeEnabled();
    await submitOf(again).click();
    await expect(again).toHaveCount(0);
    await expect(page.getByText(NOTICE_DELETED(target.filename))).toBeVisible();
    await expect(rowOf(page, target.filename, true)).toHaveCount(0);

    // Gone: the record and its preview rows — and a tombstone in the trail.
    expect(await getE2EImport(target.id)).toBeNull();
    expect(await countE2EImportRows(target.id)).toBe(0);
    expect(await getE2EImportAuditActions(target.id)).toEqual([
      "CURRICULUM_IMPORT_DELETED",
    ]);
    // What the import made or changed in the curriculum is not undone.
    expect(await getE2EAdminStatusCounts()).toEqual(curriculumBefore);
    expect(await getE2EItemState(drafted.id)).toEqual(itemBefore);
  });

  test("offers no way to delete an import that is not archived — only to archive it", async ({
    page,
    baseURL,
  }) => {
    await commands(1);
    const target = await made("keep", { status: "completed" });
    await openHistory(page);
    await expect(archiveButton(page, target.filename)).toBeVisible();
    await expect(deleteButton(page, target.filename)).toHaveCount(0);

    // And the endpoint will not, whatever the page offers: the service's own rule.
    await renewSession(page);
    const response = await page.request.post(commandUrl(target.id, "delete"), {
      headers: fromThisApp(originOf(baseURL)),
      data: { confirmation: "DELETE" },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.message).toBe(
      "Only an archived import can be permanently deleted.",
    );
    expect(await getE2EImport(target.id)).not.toBeNull();
    expect(await getE2EImportAuditActions(target.id)).toEqual([]);
  });

  test("an archive pressed hard is one archive — one request, one audit event", async ({
    page,
  }) => {
    await commands(1);
    const target = await made("double");
    await openHistory(page);

    await archiveButton(page, target.filename).dblclick();
    await expect(
      page.getByText(NOTICE_ARCHIVED(target.filename)),
    ).toBeVisible();
    await expect(rowOf(page, target.filename)).toHaveCount(0);
    expect(await getE2EImportAuditActions(target.id)).toEqual([
      "CURRICULUM_IMPORT_ARCHIVED",
    ]);
    expect(observed).toBe(1);
  });

  test("is operable by keyboard alone — archive from the button, and delete from the button, through the word, to confirming", async ({
    page,
  }) => {
    await commands(2);
    const live = await made("keys-live");
    const old = await made("keys-old", { archived: true });

    await openHistory(page);
    await archiveButton(page, live.filename).focus();
    await expect(archiveButton(page, live.filename)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(NOTICE_ARCHIVED(live.filename))).toBeVisible();
    await expect(rowOf(page, live.filename)).toHaveCount(0);

    await openHistory(page, { archived: true });
    await deleteButton(page, old.filename).focus();
    await page.keyboard.press("Enter");
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await focusIsInside(page);
    // Escape closes it and sends nothing, and focus goes back to the button
    // that opened it.
    await typedWord(dialog).focus();
    await page.keyboard.type("DELETE");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(deleteButton(page, old.filename)).toBeFocused();
    expect(await getE2EImport(old.id)).not.toBeNull();
    expect(observed).toBe(1);

    await page.keyboard.press("Enter");
    await expect(dialogOf(page)).toBeVisible();
    await typedWord(dialogOf(page)).focus();
    await expect(typedWord(dialogOf(page))).toHaveValue("");
    await page.keyboard.type("DELETE");
    await page.keyboard.press("Enter");
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(page.getByText(NOTICE_DELETED(old.filename))).toBeVisible();
    expect(await getE2EImport(old.id)).toBeNull();
  });

  test("tells an Admin the list was stale — an import that is gone is reported, and the list is read again", async ({
    page,
  }) => {
    await commands(1);
    const gone = await made("gone");
    const other = await made("other");
    await openHistory(page);
    await expect(rowOf(page, gone.filename)).toBeVisible();

    // Somebody else deleted it while this page was open.
    await removeSeededImports([gone.id]);
    await archiveButton(page, gone.filename).click();
    await expect(
      refusedNotice(page, "This import no longer exists."),
    ).toBeVisible();
    await expect(rowOf(page, gone.filename)).toHaveCount(0);
    await expect(rowOf(page, other.filename)).toBeVisible();
    expect(await getE2EImport(other.id)).toMatchObject({ archivedAt: null });
  });

  test("a delete confirmed on an import that is gone, or no longer archived, is refused in the dialog — nothing is removed — and offers only to reload", async ({
    page,
  }) => {
    await commands(2);
    const revived = await made("revived", { archived: true });
    const vanished = await made("vanished", { archived: true });
    await openHistory(page, { archived: true });

    // Restored by someone else since this list loaded: no longer deletable.
    await setE2EImportArchived(revived.id, false);
    let dialog = await openDelete(page, revived.filename);
    await typedWord(dialog).fill("DELETE");
    await submitOf(dialog).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Only an archived import can be permanently deleted.",
    );
    // Not a blind retry: the view is out of date, so it offers to look again.
    await expect(dialog.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
    await dialog.getByRole("button", { name: "Reload the list" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, revived.filename, true)).toHaveCount(0);
    expect(await getE2EImport(revived.id)).toMatchObject({ archivedAt: null });
    expect(await getE2EImportAuditActions(revived.id)).toEqual([]);

    // Gone altogether.
    await removeSeededImports([vanished.id]);
    dialog = await openDelete(page, vanished.filename);
    await typedWord(dialog).fill("DELETE");
    await submitOf(dialog).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "This import no longer exists.",
    );
    await dialog.getByRole("button", { name: "Reload the list" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowOf(page, vanished.filename, true)).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Who may use it                                                             */
/* -------------------------------------------------------------------------- */

test.describe("who may use it", () => {
  test("imports are an Admin's end to end — a writer, developer, beta tester and learner are turned away from every page and endpoint, are not offered the link, and nothing changes", async ({
    page,
    baseURL,
  }) => {
    const target = await made("target", {
      status: "needs_review",
      ...NEEDS_REVIEW,
    });
    const filed = await made("filed", { status: "completed", archived: true });
    await seedImportRows(target.id, REVIEW_ROWS);
    const targetBefore = (await getE2EImport(target.id))!;
    const filedBefore = (await getE2EImport(filed.id))!;
    const headers = fromThisApp(originOf(baseURL));
    const untouched = async () => {
      expect(await getE2EImport(target.id)).toEqual(targetBefore);
      expect(await getE2EImport(filed.id)).toEqual(filedBefore);
      expect(await getE2EImportAuditActions(target.id)).toEqual([]);
      expect(await getE2EImportAuditActions(filed.id)).toEqual([]);
      expect(await countE2EImportRows(target.id)).toBe(REVIEW_ROWS.length);
    };
    const sidebar = page.getByRole("navigation", { name: "Admin" });

    // The Admin has all of it: the pages, the endpoints, the link.
    await openHistory(page);
    await expect(archiveButton(page, target.filename)).toBeVisible();
    await expect(page.getByRole("link", { name: "New Import" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Imports" })).toBeVisible();

    // Everyone else is turned away from all of it — a writer included, who could
    // read the history until the owner's decision of 2026-10-14.
    for (const role of [
      "writer",
      "developer",
      "beta-tester",
      "user",
    ] as const) {
      await setE2EAdminRole(role);
      for (const path of [
        `${HISTORY}?language=${languageId}`,
        `${ARCHIVED}?language=${languageId}`,
        detailUrl(target.id),
        `${HISTORY}/new?language=${languageId}`,
      ]) {
        expect((await page.goto(path))?.status(), `${role}: ${path}`).toBe(403);
      }
      await clerkReady(page);
      for (const query of ["", "&archived=true"]) {
        expect(
          (
            await page.request.get(
              `${IMPORTS_API}?language=${languageId}${query}`,
            )
          ).status(),
          `${role}: the history${query}`,
        ).toBe(403);
      }
      for (const command of COMMANDS) {
        const response = await page.request.post(
          commandUrl(target.id, command),
          { headers, data: bodyOf(command) },
        );
        expect(response.status(), `${role}: ${command}`).toBe(403);
      }
      await untouched();
    }

    // A writer is let into the console — and is not offered what would refuse them.
    await setE2EAdminRole("writer");
    expect((await page.goto("/admin"))?.status()).toBe(200);
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Imports" })).toHaveCount(0);
    await expect(
      sidebar.getByRole("link", { name: "Dictionary" }),
    ).toBeVisible();
    await clerkReady(page);
    const me = await page.request.get("/api/v1/admin/me");
    expect(
      Object.hasOwn((await me.json()).data.permissions.resources, "imports"),
    ).toBe(false);

    await setE2EAdminRole("admin");
    await untouched();
  });

  test("a role revoked while the history is open replaces it with access-denied on refocus — no import lingers beside the denial", async ({
    page,
  }) => {
    const target = await made("revoked");
    await openHistory(page);
    await expect(archiveButton(page, target.filename)).toBeVisible();
    await expect(page.getByRole("link", { name: "New Import" })).toBeVisible();

    // No longer an Admin: there is nothing of imports left for them to read, so
    // the denial replaces the list.
    await setE2EAdminRole("writer");
    await refocus(page);
    await expect(denial(page)).toBeVisible();
    await expect(table(page)).toHaveCount(0);
    await expect(rowOf(page, target.filename)).toHaveCount(0);
    await expect(archiveButton(page, target.filename)).toHaveCount(0);
    await shot(page, "imports-list-denied");
  });

  test("a click made after the role was revoked is refused by the server — a warning, not a change", async ({
    page,
  }) => {
    await commands(1);
    const target = await made("late");
    await openHistory(page);
    await expect(archiveButton(page, target.filename)).toBeVisible();

    // The page still shows the button; the server no longer allows it.
    await setE2EAdminRole("writer");
    await archiveButton(page, target.filename).click();
    await expect(refusedNotice(page, NO_ACCESS)).toBeVisible();
    expect((await getE2EImport(target.id))!.archivedAt).toBeNull();
    expect(await getE2EImportAuditActions(target.id)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* What the endpoints refuse                                                  */
/* -------------------------------------------------------------------------- */

test.describe("what the endpoints refuse", () => {
  let target: E2EImport;
  let filed: E2EImport;
  let before: { target: E2EImport; filed: E2EImport };

  test.beforeAll(async () => {
    target = await seedImport({
      filename: fileName("endpoint-target"),
      status: "needs_review",
      ...NEEDS_REVIEW,
    });
    filed = await seedImport({
      filename: fileName("endpoint-filed"),
      status: "completed",
      archived: true,
    });
    await seedImportRows(target.id, REVIEW_ROWS);
    before = {
      target: (await getE2EImport(target.id))!,
      filed: (await getE2EImport(filed.id))!,
    };
  });
  test.afterAll(async () => {
    await removeSeededImports([target.id, filed.id]);
  });

  const untouched = async () => {
    expect(await getE2EImport(target.id)).toEqual(before.target);
    expect(await getE2EImport(filed.id)).toEqual(before.filed);
    expect(await getE2EImportAuditActions(target.id)).toEqual([]);
    expect(await getE2EImportAuditActions(filed.id)).toEqual([]);
  };
  /** Every command, against the import it would be sensible for. */
  const aimed = (): [Command, E2EImport][] => [
    ["archive", target],
    ["restore", filed],
    ["delete", filed],
  ];

  test("a cross-site page cannot archive, restore or delete as a signed-in Admin", async ({
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
    for (const [command, record] of aimed()) {
      for (const [name, headers] of attempts) {
        const response = await page.request.post(
          commandUrl(record.id, command),
          {
            headers,
            data: bodyOf(command),
          },
        );
        expect(response.status(), `${command}: ${name}`).toBe(403);
      }
    }
    await untouched();
  });

  test("only JSON is accepted, never in the query string, and never large", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    for (const [command, record] of aimed()) {
      for (const type of [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
      ]) {
        const response = await page.request.post(
          commandUrl(record.id, command),
          {
            headers: fromThisApp(originOf(baseURL), type),
            data: JSON.stringify(bodyOf(command)),
          },
        );
        expect(response.status(), `${command}: ${type}`).toBe(415);
      }
      const inQuery = await page.request.post(
        `${commandUrl(record.id, command)}?confirmation=DELETE`,
        { headers, data: bodyOf(command) },
      );
      expect(inQuery.status(), `${command}: a query string`).toBe(422);
      const big = await page.request.post(commandUrl(record.id, command), {
        headers,
        data: JSON.stringify({
          ...bodyOf(command),
          padding: "x".repeat(10_000),
        }),
      });
      expect(big.status(), `${command}: a large body`).toBe(413);
    }
    await untouched();
  });

  test("malformed and over-eager bodies are refused — the body cannot name who acts, a status, or a different import", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const send = async (command: Command, record: E2EImport, data: unknown) =>
      page.request.post(commandUrl(record.id, command), { headers, data });

    // Archive and restore carry nothing: which import is the address, who is asking is the session.
    const nothing: [string, unknown][] = [
      ["invalid JSON", "{not json"],
      ["a list", []],
      ["null", "null"],
      ["an actor", { actorUserId: "someone-else" }],
      ["a status", { status: "completed" }],
      ["another import", { importId: filed.id }],
      ["a reason", { reason: "tidy up" }],
    ];
    for (const [name, data] of nothing) {
      expect(
        (await send("archive", target, data)).status(),
        `archive: ${name}`,
      ).toBe(422);
      expect(
        (await send("restore", filed, data)).status(),
        `restore: ${name}`,
      ).toBe(422);
    }

    // Delete carries the word that was typed, exactly.
    const words: [string, unknown][] = [
      ["no confirmation", {}],
      ["an empty confirmation", { confirmation: "" }],
      ["lower case", { confirmation: "delete" }],
      ["mixed case", { confirmation: "Delete" }],
      ["a trailing space", { confirmation: "DELETE " }],
      ["a leading space", { confirmation: " DELETE" }],
      ["a longer word", { confirmation: "DELETED" }],
      ["a boolean", { confirmation: true }],
      ["a list", { confirmation: ["DELETE"] }],
      ["an actor", { confirmation: "DELETE", actorUserId: "someone-else" }],
      ["an extra field", { confirmation: "DELETE", force: true }],
      ["invalid JSON", "{not json"],
    ];
    for (const [name, data] of words) {
      expect(
        (await send("delete", filed, data)).status(),
        `delete: ${name}`,
      ).toBe(422);
    }
    await untouched();
  });

  test("the rules hold at the endpoint, in the Admin's own words — an unknown import is gone, an unarchived one cannot be deleted, a bad id is not understood", async ({
    page,
    baseURL,
  }) => {
    await spendRateBudget("admin-mutation", 4);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const nowhere = "33333333-3333-4333-8333-333333333333";
    for (const command of COMMANDS) {
      const response = await page.request.post(commandUrl(nowhere, command), {
        headers,
        data: bodyOf(command),
      });
      expect(response.status(), `${command}: an unknown import`).toBe(404);
      expect((await response.json()).error.message).toBe(
        "This import no longer exists.",
      );
      const malformed = await page.request.post(
        commandUrl("not-an-import", command),
        { headers, data: bodyOf(command) },
      );
      expect(malformed.status(), `${command}: a malformed id`).toBe(422);
    }

    const notArchived = await page.request.post(
      commandUrl(target.id, "delete"),
      {
        headers,
        data: { confirmation: "DELETE" },
      },
    );
    expect(notArchived.status()).toBe(422);
    expect((await notArchived.json()).error.message).toBe(
      "Only an archived import can be permanently deleted.",
    );
    await untouched();
  });

  test("the history takes a language, an archived switch, a cursor and a limit — and nothing else", async ({
    page,
  }) => {
    await renewSession(page);
    const good = `language=${languageId}`;
    const refused: [string, number][] = [
      ["", 422],
      ["archived=true", 422],
      [`language=${languageId}&status=failed`, 422],
      [`language=${languageId}&sort=createdAt`, 422],
      [`language=${languageId}&order=ASC`, 422],
      [`language=${languageId}&search=csv`, 422],
      [`language=${languageId}&archived=yes`, 422],
      [`language=${languageId}&archived=`, 422],
      [`language=${languageId}&limit=0`, 422],
      [`language=${languageId}&limit=101`, 422],
      [`language=${languageId}&limit=lots`, 422],
      [`language=${languageId}&limit=1.5`, 422],
      [`language=${languageId}&cursor=`, 422],
      [`language=${languageId}&cursor=${"x".repeat(513)}`, 422],
      [`language=${languageId}&cursor=not-a-cursor`, 422],
      // Valid base64url, valid JSON — but not a cursor this list ever made.
      [
        `language=${languageId}&cursor=${Buffer.from(
          JSON.stringify({ c: "yesterday", i: "x" }),
        ).toString("base64url")}`,
        422,
      ],
      [
        `language=${languageId}&cursor=${Buffer.from(
          JSON.stringify({
            createdAt: "2026-01-01T00:00:00.000Z",
            id: target.id,
          }),
        ).toString("base64url")}`,
        422,
      ],
      ["language=not-a-language", 422],
      ["language=44444444-4444-4444-8444-444444444444", 404],
    ];
    for (const [query, status] of refused) {
      expect(
        (await page.request.get(`${IMPORTS_API}?${query}`)).status(),
        query || "(no query)",
      ).toBe(status);
    }
    for (const query of [
      good,
      `${good}&archived=false`,
      `${good}&archived=true`,
      `${good}&limit=1`,
      `${good}&limit=100`,
    ]) {
      expect(
        (await page.request.get(`${IMPORTS_API}?${query}`)).status(),
        query,
      ).toBe(200);
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
        (
          await page.request[method](IMPORTS_API, { headers, data: {} })
        ).status(),
        `${method} on the history`,
      ).toBe(405);
    }
    for (const command of COMMANDS) {
      for (const method of ["get", "put", "patch", "delete"] as const) {
        expect(
          (
            await page.request[method](commandUrl(target.id, command), {
              headers,
            })
          ).status(),
          `${method} on ${command}`,
        ).toBe(405);
      }
    }
    await untouched();
  });

  test("an anonymous caller gets 401 and a learner 403, from the history and from every command", async ({
    browser,
    baseURL,
  }) => {
    const headers = fromThisApp(originOf(baseURL));
    const calls = (request: Page["request"]) => [
      () => request.get(`${IMPORTS_API}?language=${languageId}`),
      ...aimed().map(
        ([command, record]) =>
          () =>
            request.post(commandUrl(record.id, command), {
              headers,
              data: bodyOf(command),
            }),
      ),
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

  test("privileged responses are never cached — the history, a command, and a refusal", async ({
    page,
    baseURL,
  }) => {
    await commands(2);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const fresh = await made("cache", { archived: true });

    const list = await page.request.get(
      `${IMPORTS_API}?language=${languageId}`,
    );
    expect(list.status()).toBe(200);
    expect(list.headers()["cache-control"]).toContain("no-store");

    const done = await page.request.post(commandUrl(fresh.id, "restore"), {
      headers,
      data: {},
    });
    expect(done.status()).toBe(200);
    expect(done.headers()["cache-control"]).toContain("no-store");

    const refused = await page.request.post(commandUrl(fresh.id, "delete"), {
      headers,
      data: { confirmation: "DELETE" },
    });
    expect(refused.status()).toBe(422);
    expect(refused.headers()["cache-control"]).toContain("no-store");
  });

  test("a command repeated is the same command — archiving what is archived, or restoring what is not, changes nothing and adds nothing to the trail", async ({
    page,
    baseURL,
  }) => {
    await commands(4);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const fresh = await made("repeat");
    const send = (command: Command) =>
      page.request.post(commandUrl(fresh.id, command), { headers, data: {} });

    expect((await send("archive")).status()).toBe(200);
    const archivedAt = (await getE2EImport(fresh.id))!.archivedAt;
    expect(archivedAt).not.toBeNull();
    expect((await send("archive")).status()).toBe(200);
    sameInstant((await getE2EImport(fresh.id))!.archivedAt, archivedAt);
    expect(await getE2EImportAuditActions(fresh.id)).toEqual([
      "CURRICULUM_IMPORT_ARCHIVED",
    ]);

    expect((await send("restore")).status()).toBe(200);
    expect((await send("restore")).status()).toBe(200);
    expect((await getE2EImport(fresh.id))!.archivedAt).toBeNull();
    expect(await getE2EImportAuditActions(fresh.id)).toEqual([
      "CURRICULUM_IMPORT_ARCHIVED",
      "CURRICULUM_IMPORT_RESTORED",
    ]);
  });

  test("requests that arrive together are one command — three archives, or three deletes, at once make one change and one audit event", async ({
    page,
    baseURL,
  }) => {
    await commands(6);
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const live = await made("together-live");
    const old = await made("together-old", { archived: true });
    const send = (record: E2EImport, command: Command) =>
      page.request.post(commandUrl(record.id, command), {
        headers,
        data: bodyOf(command),
      });

    // Repeating an archive is a no-op, so every one of them is answered.
    const archives = await Promise.all([
      send(live, "archive"),
      send(live, "archive"),
      send(live, "archive"),
    ]);
    expect(archives.map((response) => response.status())).toEqual([
      200, 200, 200,
    ]);
    expect((await getE2EImport(live.id))!.archivedAt).not.toBeNull();
    expect(await getE2EImportAuditActions(live.id)).toEqual([
      "CURRICULUM_IMPORT_ARCHIVED",
    ]);

    // A delete can only happen once: one is done, the others are told it is gone.
    const deletes = await Promise.all([
      send(old, "delete"),
      send(old, "delete"),
      send(old, "delete"),
    ]);
    expect(deletes.map((response) => response.status()).sort()).toEqual([
      200, 404, 404,
    ]);
    expect(await getE2EImport(old.id)).toBeNull();
    expect(await getE2EImportAuditActions(old.id)).toEqual([
      "CURRICULUM_IMPORT_DELETED",
    ]);
  });

  test("pages are exact in both directions over live data — however many imports share an instant, and whatever the page size", async ({
    page,
  }) => {
    await renewSession(page);
    const tag = `${TAG}-exact`;
    const total = 23;
    created.push(...(await seedManyImports(tag, total)));
    const inDatabase = (await getE2EImportsTagged(tag)).map(
      (record) => record.id,
    );
    expect(inDatabase).toHaveLength(total);
    // Nobody else's imports sit above these: the first page is theirs.
    const base = `language=${languageId}`;

    for (const limit of [1, 4, 7, 23, 50]) {
      const forward: string[][] = [];
      const cursors: (string | null)[] = [null];
      let current = await readPage(page, `${base}&limit=${limit}`);
      expect(current.hasPreviousPage, `limit ${limit}: the first page`).toBe(
        false,
      );
      for (;;) {
        forward.push(current.items.map((row) => row.id));
        if (!current.nextCursor) break;
        // A cursor that does not move forward would never end — fail, don't hang.
        expect(
          forward.length,
          `limit ${limit}: the cursor must advance`,
        ).toBeLessThanOrEqual(total + 1);
        cursors.push(current.nextCursor);
        current = await readPage(
          page,
          `${base}&limit=${limit}&cursor=${current.nextCursor}`,
        );
        expect(current.hasPreviousPage, `limit ${limit}: a later page`).toBe(
          true,
        );
      }
      const walked = forward.flat();
      // Each id exactly once, in the database's order.
      expect(new Set(walked).size, `limit ${limit}: no repeats`).toBe(
        walked.length,
      );
      expect(walked.slice(0, total), `limit ${limit}: in order`).toEqual(
        inDatabase,
      );

      // And back again: each page's previous page is the page that was before it.
      const backwards: string[][] = [current.items.map((row) => row.id)];
      while (current.hasPreviousPage) {
        expect(
          backwards.length,
          `limit ${limit}: the way back must advance`,
        ).toBeLessThanOrEqual(total + 1);
        current = await readPage(
          page,
          `${base}&limit=${limit}${
            current.previousCursor ? `&cursor=${current.previousCursor}` : ""
          }`,
        );
        backwards.unshift(current.items.map((row) => row.id));
      }
      expect(backwards, `limit ${limit}: the way back`).toEqual(forward);
      expect(cursors.length).toBe(forward.length);
    }
  });

  test("the normal and the archived history never share a row", async ({
    page,
  }) => {
    await renewSession(page);
    const live = await made("split-live");
    const old = await made("split-old", { archived: true });
    const normal = await readPage(page, `language=${languageId}&limit=100`);
    const archived = await readPage(
      page,
      `language=${languageId}&archived=true&limit=100`,
    );
    expect(normal.items.map((row) => row.id)).toContain(live.id);
    expect(normal.items.map((row) => row.id)).not.toContain(old.id);
    expect(archived.items.map((row) => row.id)).toContain(old.id);
    expect(archived.items.map((row) => row.id)).not.toContain(live.id);
    expect(normal.items.every((row) => row.archivedAt === null)).toBe(true);
    expect(archived.items.every((row) => row.archivedAt !== null)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Appearance                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("appearance", () => {
  test("follows the dark theme through the app's own CSS variables — the history, the delete dialog, and an import's own page", async ({
    page,
  }) => {
    const review = await made("dark-review", {
      status: "needs_review",
      ...NEEDS_REVIEW,
    });
    await seedImportRows(review.id, REVIEW_ROWS);
    const done = await made("dark-done", { status: "completed", totalRows: 3 });
    const failed = await made("dark-failed", {
      status: "failed",
      attemptCount: 2,
      lastErrorCode: "COMMIT_FAILED",
      lastErrorSummary: "The commit job stopped.",
    });
    const old = await made("dark-old", { archived: true });
    await page.emulateMedia({ colorScheme: "dark" });

    await openHistory(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(rowOf(page, done.filename)).toBeVisible();
    await expect(rowOf(page, failed.filename)).toBeVisible();
    await shot(page, "imports-list-dark");

    await openHistory(page, { archived: true });
    const dialog = await openDelete(page, old.filename);
    await typedWord(dialog).fill("DELETE");
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
        "#delete-import-title",
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
    await shot(page, "imports-delete-dialog-dark");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    // The import's own page is the app's own markup: it follows the theme too.
    await openImport(page, review);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
      page.getByRole("button", { name: "Confirm Import" }),
    ).toBeDisabled();
    await shot(page, "import-needs-review-dark");
    await openImport(page, failed);
    await shot(page, "import-failed-dark");
  });

  test("lays out at 390px without scrolling the page sideways — the history, the pinned action, the delete dialog, and an import's own page", async ({
    page,
  }) => {
    const long = await made(
      "a-fairly-long-file-name-that-has-to-wrap-onto-more-than-one-line-in-a-narrow-column",
      {
        status: "needs_review",
        ...NEEDS_REVIEW,
      },
    );
    await seedImportRows(long.id, REVIEW_ROWS);
    const old = await made("mobile-old", {
      archived: true,
      status: "completed",
      totalRows: 9,
      createCount: 9,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );

    // The table has a frame of its own; nothing in it may need scrolling sideways.
    const frameOverflow = () =>
      page.evaluate(() => {
        const frame = document.querySelector(
          ".RaDataTable-tableWrapper",
        ) as HTMLElement;
        return frame.scrollWidth - frame.clientWidth;
      });

    await openHistory(page);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // What the screen is for — which file, and where it is — and the action
    // beside it are on screen; the counts and the dates give way, and the
    // file's name is not squeezed to a few letters a line.
    await expect(rowOf(page, long.filename)).toBeVisible();
    await expect(cellOf(page, long.filename, STATUS)).toBeInViewport({
      ratio: 1,
    });
    await expect(archiveButton(page, long.filename)).toBeInViewport({
      ratio: 1,
    });
    expect(await frameOverflow()).toBeLessThanOrEqual(0);
    for (const hidden of ["Summary", "Created"]) {
      await expect(
        table(page).getByRole("columnheader", { name: hidden }),
      ).toBeHidden();
    }
    const nameBox = await rowOf(page, long.filename)
      .getByRole("link", { name: long.filename, exact: true })
      .boundingBox();
    expect(nameBox!.width).toBeGreaterThanOrEqual(90);
    await shot(page, "imports-list-mobile");

    await openHistory(page, { archived: true });
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(cellOf(page, old.filename, STATUS, true)).toBeInViewport({
      ratio: 1,
    });
    await expect(restoreButton(page, old.filename)).toBeInViewport({
      ratio: 1,
    });
    await expect(deleteButton(page, old.filename)).toBeInViewport({ ratio: 1 });
    expect(await frameOverflow()).toBeLessThanOrEqual(0);
    await expect(
      table(page, true).getByRole("columnheader", { name: "Archived" }),
    ).toBeHidden();
    await shot(page, "imports-archived-mobile");
    const dialog = await openDelete(page, old.filename);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Taller than the screen is fine; the way to confirm or cancel must still be reachable.
    await typedWord(dialog).fill("DELETE");
    await expect(submitOf(dialog)).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Cancel" }),
    ).toBeInViewport();
    await shot(page, "imports-delete-dialog-mobile");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    await openImport(page, long);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(
      page.getByRole("button", { name: "Confirm Import" }),
    ).toBeVisible();
    await shot(page, "import-needs-review-mobile");

    // And the way back to the history is in the menu.
    await page.getByRole("button", { name: "Open Admin navigation" }).click();
    const menu = page.getByRole("dialog", { name: "Admin" });
    await expect(
      menu.getByRole("link", { name: "Imports", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await shot(page, "imports-menu-mobile");
  });
});

/* -------------------------------------------------------------------------- */
/* Rate limits — last, because they use a limit up on purpose                 */
/* -------------------------------------------------------------------------- */

test.describe("rate limits", () => {
  test("archiving, restoring and deleting share the write limit — a burst is answered 429 with Retry-After, and nothing is leaked or changed by the refusal", async ({
    page,
    baseURL,
  }) => {
    await renewSession(page);
    const headers = fromThisApp(originOf(baseURL));
    const bystander = await made("burst", { status: "completed" });
    const before = (await getE2EImport(bystander.id))!;
    // Everything this spec may spend, so the window is clean when the burst starts.
    await spendRateBudget("admin-mutation", 24);

    // An import that is not there is answered 404 by the service every time,
    // so each request is counted by the limit and none of them can change anything.
    const nowhere = "55555555-5555-4555-8555-555555555555";
    const statuses: number[] = [];
    let limited: APIResponse | undefined;
    for (let attempt = 0; attempt < 50 && !limited; attempt++) {
      const response = await page.request.post(commandUrl(nowhere, "archive"), {
        headers,
        data: {},
      });
      statuses.push(response.status());
      if (response.status() === 429) limited = response;
    }
    markRateLimitExhausted("admin-mutation");

    expect(limited, `statuses: ${statuses.join(" ")}`).toBeDefined();
    // Not found, not found, ... refused: nothing else on the way.
    expect(statuses.slice(0, -1).every((status) => status === 404)).toBe(true);
    expect(statuses.length).toBeLessThanOrEqual(31);
    expect(
      Number(limited!.headers()["retry-after"]),
      "Retry-After",
    ).toBeGreaterThan(0);
    expect(limited!.headers()["cache-control"]).toContain("no-store");
    const body = await limited!.json();
    expect(body.error.message).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(nowhere);
    expect(await getE2EImport(bystander.id)).toEqual(before);
  });
});
