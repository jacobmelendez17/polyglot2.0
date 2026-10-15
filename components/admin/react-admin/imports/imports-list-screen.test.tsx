import { focusManager } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminImportStatus } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { DISMISSALS } from "../test-support/dialog-dismissals";
import { navigation } from "../test-support/next-navigation";
import {
  TWO_LANGUAGES,
  importPage,
  importRow,
  renderImportsList,
  type ImportCommand,
} from "./imports-list-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const HISTORY_PATH = "/admin/curriculum/imports";
const ARCHIVED_PATH = "/admin/curriculum/imports/archived";

function visit(search = "language=lang-es", path = HISTORY_PATH) {
  navigation.reset(search, path);
}

beforeEach(() => {
  visit();
});

const table = (name = "Import history") => screen.findByRole("table", { name });
const archivedTable = () => table("Archived imports");

const refusal = (code: string, status: number, serverMessage?: string) =>
  new AdminApiError(code, status, undefined, { serverMessage });

/** Lets every request a press has set going reach the API, so "no second one" is a fact and not just "not yet". */
const turn = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** One import in every status the pipeline can leave it in. */
const EVERY_STATUS: [AdminImportStatus, string, string | null][] = [
  ["uploading", "Processing", "Uploading the file"],
  ["queued_for_preview", "Processing", "Waiting to validate"],
  ["previewing", "Processing", "Validating rows"],
  ["needs_review", "Needs review", "Rows need a decision"],
  ["ready_to_import", "Ready to import", "Waiting for confirmation"],
  ["queued_for_import", "Processing", "Waiting to import"],
  ["importing", "Processing", "Importing"],
  ["completed", "Completed", null],
  ["failed", "Failed", null],
];

/* -------------------------------------------------------------------------- */

describe("ImportsListScreen — what is shown (parity with the history it replaces)", () => {
  it("shows the file, its status, what it found and when — in a table", async () => {
    renderImportsList({
      pages: {
        "": importPage([
          importRow(1, {
            originalFilename: "spanish-level-2.csv",
            status: "completed",
            totalRows: 61,
            createCount: 43,
            updateCount: 8,
            moveCount: 2,
            createdAt: "2026-09-10T11:59:00.123Z",
          }),
        ]),
      },
    });
    const t = await table();

    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["File", "Status", "Summary", "Created", "Actions"]);

    const [row] = within(t).getAllByRole("row").slice(1);
    expect(within(row!).getByText("spanish-level-2.csv")).toBeVisible();
    expect(within(row!).getByText("Completed")).toBeVisible();
    expect(
      within(row!).getByText("61 rows · 43 created · 8 updated · 2 moved"),
    ).toBeVisible();
    const when = within(row!).getByText(/2026/);
    expect(when.tagName).toBe("TIME");
    expect(when).toHaveAttribute("datetime", "2026-09-10T11:59:00.123Z");
    expect(when).toHaveAttribute("title");
  });

  it.each(EVERY_STATUS)(
    "shows a %s import as %s, saying where it is",
    async (status, label, stage) => {
      renderImportsList({
        pages: { "": importPage([importRow(1, { status })]) },
      });
      const [row] = within(await table())
        .getAllByRole("row")
        .slice(1);

      expect(within(row!).getByText(label)).toBeVisible();
      if (stage) expect(within(row!).getByText(stage)).toBeVisible();
    },
  );

  it("words the counts of an import that has not completed as what it would do", async () => {
    renderImportsList({
      pages: {
        "": importPage([
          importRow(1, { status: "ready_to_import" }),
          importRow(2, { status: "completed" }),
        ]),
      },
    });
    const [ready, done] = within(await table())
      .getAllByRole("row")
      .slice(1);

    expect(
      within(ready!).getByText(
        "61 rows · 43 to create · 8 to update · 2 to move",
      ),
    ).toBeVisible();
    expect(
      within(done!).getByText("61 rows · 43 created · 8 updated · 2 moved"),
    ).toBeVisible();
  });

  it("says how many rows need a decision, and how many times a failed import was tried", async () => {
    renderImportsList({
      pages: {
        "": importPage([
          importRow(1, { status: "needs_review", reviewCount: 2 }),
          importRow(2, { status: "failed", attemptCount: 3 }),
        ]),
      },
    });
    const [review, failed] = within(await table())
      .getAllByRole("row")
      .slice(1);

    expect(within(review!).getByText(/2 need review/)).toBeVisible();
    expect(within(failed!).getByText(/3 attempts/)).toBeVisible();
  });

  it("does not claim zero rows for an import the preview has not read yet", async () => {
    renderImportsList({
      pages: {
        "": importPage([
          importRow(1, {
            status: "previewing",
            totalRows: 0,
            createCount: 0,
            updateCount: 0,
            moveCount: 0,
          }),
        ]),
      },
    });
    expect(within(await table()).getByText("Not counted yet")).toBeVisible();
  });

  it("links each file to its own page, where the specialist screens stay", async () => {
    const first = importRow(1, { originalFilename: "a.csv" });
    const second = importRow(2, { originalFilename: "b.csv" });
    renderImportsList({ pages: { "": importPage([first, second]) } });
    const t = await table();

    expect(within(t).getByRole("link", { name: "a.csv" })).toHaveAttribute(
      "href",
      `/admin/curriculum/imports/${first.id}`,
    );
    expect(within(t).getByRole("link", { name: "b.csv" })).toHaveAttribute(
      "href",
      `/admin/curriculum/imports/${second.id}`,
    );
  });

  it("asks the endpoint for a bounded page of the URL's language, newest first", async () => {
    const { listRequests } = renderImportsList();
    await table();
    expect(listRequests[0]).toBe("/imports?language=lang-es&limit=20");
  });

  it("does not sort and shows no checkboxes — nothing here acts on several imports at once", async () => {
    renderImportsList();
    const t = await table();
    expect(within(t).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(t).queryAllByRole("button", { name: /sort/i })).toHaveLength(
      0,
    );
  });

  it("shows a labelled skeleton while it loads", async () => {
    renderImportsList();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the import history",
    );
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ImportsListScreen — the archived history", () => {
  const archivedRow = importRow(7, {
    originalFilename: "old.csv",
    archivedAt: "2026-10-01T08:30:00.000Z",
  });

  beforeEach(() => visit("language=lang-es", ARCHIVED_PATH));

  it("asks the endpoint for the archive, and shows when each import was archived", async () => {
    const { listRequests } = renderImportsList({
      archived: true,
      pages: { "": importPage([archivedRow]) },
    });
    const t = await archivedTable();

    expect(listRequests[0]).toBe(
      "/imports?language=lang-es&archived=true&limit=20",
    );
    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["File", "Status", "Summary", "Created", "Archived", "Actions"]);
    const archivedAt = within(t).getAllByText(/2026/);
    expect(
      archivedAt.some(
        (time) => time.getAttribute("datetime") === archivedRow.archivedAt,
      ),
    ).toBe(true);
  });

  it("offers Restore and Permanently delete — not Archive", async () => {
    renderImportsList({
      archived: true,
      pages: { "": importPage([archivedRow]) },
    });
    await archivedTable();

    expect(
      screen.getByRole("button", { name: "Restore old.csv" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Permanently delete old.csv" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Archive / })).toBeNull();
  });

  it("says plainly when nothing is archived", async () => {
    renderImportsList({ archived: true, pages: { "": importPage([]) } });
    expect(await screen.findByText("Nothing archived")).toBeVisible();
    expect(
      screen.getByText("Archived imports will show up here."),
    ).toBeVisible();
  });
});

describe("ImportsListScreen — the commands (an Admin's alone)", () => {
  // Imports are an Admin's end to end (the owner's decision of 2026-10-14): the
  // page and every endpoint refuse anyone else, so the screen has no read-only
  // form. A role that loses access is answered by the endpoint — see the
  // "revoked" test under the error states.
  it("shows an Admin Archive on every row", async () => {
    renderImportsList();
    await table();
    expect(
      await screen.findByRole("button", { name: "Archive level-1.csv" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Archive level-2.csv" }),
    ).toBeVisible();
  });

  it("shows the archived history Restore and Permanently delete on every row", async () => {
    visit("language=lang-es", ARCHIVED_PATH);
    renderImportsList({
      archived: true,
      pages: {
        "": importPage([
          importRow(1, { archivedAt: "2026-10-01T08:30:00.000Z" }),
        ]),
      },
    });
    await archivedTable();

    expect(
      screen.getByRole("button", { name: "Restore level-1.csv" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Permanently delete level-1.csv" }),
    ).toBeVisible();
  });

  it("does not ask who the person is — it never looked up permissions to decide what to show", async () => {
    const { fetchMe } = renderImportsList();
    await table();
    expect(fetchMe).not.toHaveBeenCalled();
  });
});

describe("ImportsListScreen — archive and restore", () => {
  it("archives an import with one click: the right command, the right words, the history read again", async () => {
    const user = userEvent.setup();
    const target = importRow(1, { originalFilename: "spanish-level-2.csv" });
    const { commands, invalidate, listRequests } = renderImportsList({
      pages: { "": importPage([target, importRow(2)]) },
    });
    await table();
    const reads = listRequests.length;

    await user.click(
      screen.getByRole("button", { name: "Archive spanish-level-2.csv" }),
    );

    expect(
      await screen.findByText(
        "Archived “spanish-level-2.csv”. It is under Archived now.",
      ),
    ).toBeVisible();
    expect(commands).toEqual([
      { verb: "archive", importId: target.id, body: {} },
    ]);
    // No second request, no key: it is one idempotent command.
    expect(commands).toHaveLength(1);
    expect(
      invalidate.mock.calls.map((call) => call[0]?.queryKey),
    ).toContainEqual(["imports"]);
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(reads));
  });

  it("disables the row's own button while its command is in flight, and no other", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const first = importRow(1);
    renderImportsList({
      pages: { "": importPage([first, importRow(2)]) },
      command: async ({ importId }) => {
        await gate;
        return { importId };
      },
    });
    await table();

    await user.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Archive level-1.csv" }),
      ).toBeDisabled(),
    );
    expect(
      screen.getByRole("button", { name: "Archive level-2.csv" }),
    ).toBeEnabled();
    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Archive level-1.csv" }),
      ).toBeEnabled(),
    );
  });

  // Disabling the button works only once React has drawn it again, and a fast
  // double click does not wait for that — nor does a click that arrives while a
  // slow answer is on its way. The service does tolerate a repeat (an archived
  // import archived again is a no-op), but not a *simultaneous* one: the audit
  // trail gets one event per request that got past the check.
  it("sends one command however hard the button is pressed — a press before the first is answered is ignored", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const { commands } = renderImportsList({
      pages: { "": importPage([importRow(1), importRow(2)]) },
      command: async ({ importId }) => {
        await gate;
        return { importId };
      },
    });
    await table();
    const button = screen.getByRole("button", { name: "Archive level-1.csv" });

    // Three presses with no chance for the screen to draw in between.
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(commands).toHaveLength(1));
    await turn();
    expect(commands).toHaveLength(1);

    // Another import's command is another intent, and goes.
    fireEvent.click(
      screen.getByRole("button", { name: "Archive level-2.csv" }),
    );
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands.map((sent) => sent.importId)).toEqual([
      importRow(1).id,
      importRow(2).id,
    ]);

    finish();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Archive level-1.csv" }),
      ).toBeEnabled(),
    );
    // Once answered, the same import may be commanded again.
    fireEvent.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );
    await waitFor(() => expect(commands).toHaveLength(3));
  });

  it("lets the same import be commanded again once the first has failed", async () => {
    let fail = true;
    const { commands } = renderImportsList({
      pages: { "": importPage([importRow(1)]) },
      command: async ({ importId }) => {
        if (fail) throw refusal("INTERNAL_ERROR", 500);
        return { importId };
      },
    });
    await table();

    fireEvent.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );
    await screen.findByText(
      "Something went wrong on our side. Please try again.",
    );
    fail = false;
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Archive level-1.csv" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );

    await waitFor(() => expect(commands).toHaveLength(2));
  });

  it("restores an archived import: the right command, the right words", async () => {
    const user = userEvent.setup();
    visit("language=lang-es", ARCHIVED_PATH);
    const target = importRow(3, {
      originalFilename: "old.csv",
      archivedAt: "2026-10-01T08:30:00.000Z",
    });
    const { commands } = renderImportsList({
      archived: true,
      pages: { "": importPage([target]) },
    });
    await archivedTable();

    await user.click(screen.getByRole("button", { name: "Restore old.csv" }));

    expect(
      await screen.findByText("Restored “old.csv” to the import history."),
    ).toBeVisible();
    expect(commands).toEqual([
      { verb: "restore", importId: target.id, body: {} },
    ]);
  });

  it("says so when the import has gone, and reads the history again to show it", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderImportsList({
      command: () => {
        throw refusal("NOT_FOUND", 404, "This import no longer exists.");
      },
    });
    await table();
    const reads = listRequests.length;

    await user.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );

    expect(
      await screen.findByText("This import no longer exists."),
    ).toBeVisible();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(reads));
  });

  it("warns, rather than errs, when the Admin is no longer allowed", async () => {
    const user = userEvent.setup();
    renderImportsList({
      command: () => {
        throw refusal("FORBIDDEN", 403);
      },
    });
    await table();

    await user.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );

    expect(
      await screen.findByText(
        "You don't have access to this part of the admin console.",
      ),
    ).toBeVisible();
  });

  it("never shows a server fault's own words", async () => {
    const user = userEvent.setup();
    renderImportsList({
      command: () => {
        throw refusal("INTERNAL_ERROR", 500, "deadlock on curriculum_imports");
      },
    });
    await table();

    await user.click(
      screen.getByRole("button", { name: "Archive level-1.csv" }),
    );

    expect(
      await screen.findByText(/Something went wrong on our side/),
    ).toBeVisible();
    expect(screen.queryByText(/curriculum_imports/)).toBeNull();
  });
});

describe("ImportsListScreen — permanent deletion", () => {
  const ARCHIVED = importRow(5, {
    originalFilename: "old.csv",
    archivedAt: "2026-10-01T08:30:00.000Z",
  });

  beforeEach(() => visit("language=lang-es", ARCHIVED_PATH));

  async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Permanently delete old.csv" }),
    );
    return screen.findByRole("dialog", {
      name: "Permanently delete this import?",
    });
  }

  const confirmButton = (dialog: HTMLElement) =>
    within(dialog).getByRole("button", { name: "Permanently delete" });
  const typeInto = async (
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    text: string,
  ) => {
    const field = within(dialog).getByRole("textbox", {
      name: "Type DELETE to continue",
    });
    await user.clear(field);
    if (text) await user.type(field, text);
  };

  it("asks first, says what it will and will not do, and sends nothing yet", async () => {
    const user = userEvent.setup();
    const { commands } = renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED]) },
    });
    const dialog = await open(user);

    expect(dialog).toHaveTextContent(
      "This removes the import record, stored row results, and remaining source file. This does not undo curriculum changes made by the import.",
    );
    expect(dialog).toHaveTextContent("old.csv");
    expect(confirmButton(dialog)).toBeDisabled();
    expect(commands).toHaveLength(0);
  });

  it.each([
    ["nothing", ""],
    ["a word in the wrong case", "delete"],
    ["the word with a trailing space", "DELETE "],
    ["part of the word", "DELET"],
    ["another word", "REMOVE"],
  ])("does not let %s through", async (_name, typed) => {
    const user = userEvent.setup();
    const { commands } = renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED]) },
    });
    const dialog = await open(user);

    await typeInto(user, dialog, typed);

    expect(confirmButton(dialog)).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(commands).toHaveLength(0);
  });

  it("deletes once DELETE is typed exactly: the right command and body, the right words, the history read again, the dialog closed", async () => {
    const user = userEvent.setup();
    const { commands, invalidate } = renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED]) },
    });
    const dialog = await open(user);
    await typeInto(user, dialog, "DELETE");
    expect(confirmButton(dialog)).toBeEnabled();

    await user.click(confirmButton(dialog));

    expect(
      await screen.findByText("Permanently deleted “old.csv”."),
    ).toBeVisible();
    expect(commands).toEqual([
      {
        verb: "delete",
        importId: ARCHIVED.id,
        body: { confirmation: "DELETE" },
      },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      invalidate.mock.calls.map((call) => call[0]?.queryKey),
    ).toContainEqual(["imports"]);
  });

  it("deletes with the Enter key too, once the word is right", async () => {
    const user = userEvent.setup();
    const { commands } = renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED]) },
    });
    const dialog = await open(user);
    await typeInto(user, dialog, "DELETE");

    await user.keyboard("{Enter}");

    await waitFor(() => expect(commands).toHaveLength(1));
  });

  it("sends one delete however hard the confirmation is pressed — Enter or the button, before the answer comes", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const { commands } = renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED]) },
      command: async ({ importId }) => {
        await gate;
        return { importId };
      },
    });
    const dialog = await open(user);
    await typeInto(user, dialog, "DELETE");
    const field = within(dialog).getByRole("textbox", {
      name: "Type DELETE to continue",
    });

    // Presses with no chance for the dialog to draw in between.
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(commands).toHaveLength(1));
    await turn();
    expect(commands).toHaveLength(1);

    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toHaveLength(1);
  });

  it("cancels without sending anything", async () => {
    const user = userEvent.setup();
    const { commands } = renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED]) },
    });
    const dialog = await open(user);
    await typeInto(user, dialog, "DELETE");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toHaveLength(0);
  });

  it("opens afresh for another import, with nothing typed", async () => {
    const user = userEvent.setup();
    const other = importRow(6, {
      originalFilename: "other.csv",
      archivedAt: "2026-10-02T08:30:00.000Z",
    });
    renderImportsList({
      archived: true,
      pages: { "": importPage([ARCHIVED, other]) },
    });
    let dialog = await open(user);
    await typeInto(user, dialog, "DELETE");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(
      screen.getByRole("button", { name: "Permanently delete other.csv" }),
    );
    dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByRole("textbox", { name: "Type DELETE to continue" }),
    ).toHaveValue("");
    expect(confirmButton(dialog)).toBeDisabled();
  });

  describe.each(DISMISSALS)("%s", (_how, dismiss) => {
    it("closes the dialog when nothing is being sent", async () => {
      const user = userEvent.setup();
      renderImportsList({
        archived: true,
        pages: { "": importPage([ARCHIVED]) },
      });
      await open(user);

      dismiss();

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("does nothing while the request is in flight — it must be allowed to finish and be seen", async () => {
      const user = userEvent.setup();
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => (finish = resolve));
      renderImportsList({
        archived: true,
        pages: { "": importPage([ARCHIVED]) },
        command: async ({ importId }) => {
          await gate;
          return { importId };
        },
      });
      const dialog = await open(user);
      await typeInto(user, dialog, "DELETE");
      await user.click(confirmButton(dialog));
      await within(dialog).findByRole("button", { name: "Deleting…" });

      dismiss();

      expect(screen.getByRole("dialog")).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      finish();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });

  describe("when the server refuses", () => {
    it.each([
      ["NOT_FOUND", 404, "This import no longer exists."],
      [
        "VALIDATION_FAILED",
        422,
        "Only an archived import can be permanently deleted.",
      ],
    ])(
      "(%s) says so in the dialog, offers only to reload, and sends nothing again",
      async (code, status, message) => {
        const user = userEvent.setup();
        const { commands, listRequests } = renderImportsList({
          archived: true,
          pages: { "": importPage([ARCHIVED]) },
          command: () => {
            throw refusal(code, status, message);
          },
        });
        const dialog = await open(user);
        await typeInto(user, dialog, "DELETE");
        await user.click(confirmButton(dialog));

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(
          message,
        );
        expect(
          within(dialog).queryByRole("button", { name: "Try again" }),
        ).toBeNull();

        const reads = listRequests.length;
        await user.click(
          within(dialog).getByRole("button", { name: "Reload the list" }),
        );

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(listRequests.length).toBeGreaterThan(reads));
        expect(commands).toHaveLength(1);
      },
    );

    it("offers only Close, as a warning, when the Admin is no longer allowed", async () => {
      const user = userEvent.setup();
      const { commands } = renderImportsList({
        archived: true,
        pages: { "": importPage([ARCHIVED]) },
        command: () => {
          throw refusal("FORBIDDEN", 403);
        },
      });
      const dialog = await open(user);
      await typeInto(user, dialog, "DELETE");
      await user.click(confirmButton(dialog));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "You don't have access to this part of the admin console.",
      );
      expect(
        within(dialog).queryByRole("button", { name: "Try again" }),
      ).toBeNull();
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toHaveLength(1);
    });

    it("keeps what was typed and offers Try again after a failure that may pass", async () => {
      const user = userEvent.setup();
      let attempt = 0;
      const { commands } = renderImportsList({
        archived: true,
        pages: { "": importPage([ARCHIVED]) },
        command: ({ importId }: ImportCommand) => {
          attempt += 1;
          if (attempt === 1) throw refusal("NETWORK_ERROR", 0);
          return { importId };
        },
      });
      const dialog = await open(user);
      await typeInto(user, dialog, "DELETE");
      await user.click(confirmButton(dialog));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Couldn't reach the server",
      );
      expect(
        within(dialog).getByRole("textbox", {
          name: "Type DELETE to continue",
        }),
      ).toHaveValue("DELETE");

      await user.click(
        within(dialog).getByRole("button", { name: "Try again" }),
      );

      expect(
        await screen.findByText("Permanently deleted “old.csv”."),
      ).toBeVisible();
      expect(commands).toHaveLength(2);
    });
  });
});

describe("ImportsListScreen — paging by the server's cursors", () => {
  const pages = {
    "": importPage([importRow(1), importRow(2)], { nextCursor: "after-2" }),
    "after-2": importPage([importRow(3), importRow(4)], {
      nextCursor: "after-4",
      hasPreviousPage: true,
      previousCursor: null, // the previous page is the first page
    }),
    "after-4": importPage([importRow(5)], {
      hasPreviousPage: true,
      previousCursor: "after-2",
    }),
  };

  it("offers only Next on the first page", async () => {
    renderImportsList({ pages });
    await table();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
  });

  it("offers neither when everything fits on one page", async () => {
    renderImportsList();
    await table();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  it("moves forward by handing back the server's cursor, in the URL", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderImportsList({ pages });
    await screen.findByText("level-1.csv");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum/imports?language=lang-es&cursor=after-2",
      expect.anything(),
    );
    expect(await screen.findByText("level-3.csv")).toBeVisible();
    expect(screen.queryByText("level-1.csv")).toBeNull();
    expect(listRequests.at(-1)).toContain("cursor=after-2");
  });

  it("goes back to the first page without a cursor in the URL", async () => {
    const user = userEvent.setup();
    visit("language=lang-es&cursor=after-2");
    renderImportsList({ pages });
    await screen.findByText("level-3.csv");

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum/imports?language=lang-es",
      expect.anything(),
    );
    expect(await screen.findByText("level-1.csv")).toBeVisible();
  });

  it("goes back to a middle page by its own cursor — also after a refresh or deep link", async () => {
    const user = userEvent.setup();
    visit("language=lang-es&cursor=after-4");
    renderImportsList({ pages });
    await screen.findByText("level-5.csv");

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum/imports?language=lang-es&cursor=after-2",
      expect.anything(),
    );
    expect(await screen.findByText("level-3.csv")).toBeVisible();
  });

  it("keeps the archived history on the archived route when it pages", async () => {
    const user = userEvent.setup();
    visit("language=lang-es", ARCHIVED_PATH);
    renderImportsList({
      archived: true,
      pages: {
        "": importPage([importRow(1)], { nextCursor: "after-1" }),
        "after-1": importPage([importRow(2)], {
          hasPreviousPage: true,
          previousCursor: null,
        }),
      },
    });
    await screen.findByText("level-1.csv");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    // The route is the history; only the cursor changes in the address.
    expect(navigation.push).toHaveBeenCalledWith(
      `${ARCHIVED_PATH}?language=lang-es&cursor=after-1`,
      expect.anything(),
    );
    expect(await screen.findByText("level-2.csv")).toBeVisible();
  });
});

describe("ImportsListScreen — the language", () => {
  it("offers no language switch when there is only one language", async () => {
    renderImportsList();
    await table();
    expect(screen.queryByRole("combobox", { name: /Language/ })).toBeNull();
  });

  it("offers one when there are several, and switching starts again from the first page", async () => {
    const user = userEvent.setup();
    visit("language=lang-es&cursor=after-2");
    renderImportsList({
      languages: TWO_LANGUAGES,
      pages: {
        "after-2": importPage([importRow(3)], { hasPreviousPage: true }),
      },
    });
    await screen.findByText("level-3.csv");

    await user.click(screen.getByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: "French" }));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        "/admin/curriculum/imports?language=lang-fr",
        expect.anything(),
      ),
    );
  });
});

describe("ImportsListScreen — empty states", () => {
  it("tells an Admin to start one", async () => {
    renderImportsList({ pages: { "": importPage([]) } });
    expect(await screen.findByText("No imports yet")).toBeVisible();
    expect(screen.getByText("Start one with New Import above.")).toBeVisible();
  });

  it("does not call a page past the end 'no imports yet'", async () => {
    visit("language=lang-es&cursor=gone");
    renderImportsList({
      pages: {
        gone: importPage([], { hasPreviousPage: true, previousCursor: null }),
      },
    });
    expect(
      await screen.findByText("There is nothing more on this page"),
    ).toBeVisible();
    expect(screen.queryByText("No imports yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });
});

describe("ImportsListScreen — failures", () => {
  it("explains a 403 with a route out, instead of an empty history", async () => {
    renderImportsList({ failList: () => new AdminApiError("FORBIDDEN", 403) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("No imports yet")).toBeNull();
  });

  it("sends a 401 to sign-in and shows no rows meanwhile", async () => {
    const { redirect } = renderImportsList({
      failList: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderImportsList({
      failList: () =>
        failing ? new AdminApiError("INTERNAL_ERROR", 500) : null,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side",
    );
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("level-1.csv")).toBeVisible();
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderImportsList({
      failList: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await screen.findByText("level-1.csv");

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["imports"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByText("level-1.csv")).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderImportsList({
      failList: () => (revoked ? new AdminApiError("FORBIDDEN", 403) : null),
    });
    await screen.findByText("level-1.csv");

    revoked = true;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    // Privileged rows must not linger beside the denial.
    expect(screen.queryByText("level-1.csv")).toBeNull();
  });
});

describe("ImportsListScreen — refreshing while the pipeline works", () => {
  const WORKING = importPage([
    importRow(1, {
      originalFilename: "in-flight.csv",
      status: "previewing",
      totalRows: 0,
      createCount: 0,
      updateCount: 0,
      moveCount: 0,
    }),
  ]);

  it("shows a row's new status without anyone reloading, while it is being worked on", async () => {
    const pages = { "": WORKING };
    const { listRequests } = renderImportsList({ pages, refreshMs: 30 });
    expect(await screen.findByText("Validating rows")).toBeVisible();
    const reads = listRequests.length;

    // The pipeline finishes validating: the row now waits for a decision.
    pages[""] = importPage([
      importRow(1, {
        originalFilename: "in-flight.csv",
        status: "needs_review",
        reviewCount: 2,
      }),
    ]);

    expect(await screen.findByText("Needs review")).toBeVisible();
    expect(screen.queryByText("Validating rows")).toBeNull();
    expect(listRequests.length).toBeGreaterThan(reads);
  });

  it("stops asking once nothing is being worked on — a history at rest costs no requests", async () => {
    const pages = { "": WORKING };
    const { listRequests } = renderImportsList({ pages, refreshMs: 30 });
    await screen.findByText("Validating rows");

    pages[""] = importPage([importRow(1, { status: "needs_review" })]);
    await screen.findByText("Needs review");
    const settled = listRequests.length;

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(listRequests.length).toBe(settled);
  });

  it.each(["needs_review", "ready_to_import", "completed", "failed"] as const)(
    "never asks again while every import is %s — it waits for a person, or is final",
    async (status) => {
      const { listRequests } = renderImportsList({
        pages: { "": importPage([importRow(1, { status })]) },
        refreshMs: 30,
      });
      await table();

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(listRequests).toHaveLength(1);
    },
  );

  it("does not turn an outage into a request, and a warning, every few seconds", async () => {
    let attempts = 0;
    let failing = false;
    renderImportsList({
      pages: { "": WORKING },
      refreshMs: 30,
      failList: () => {
        if (!failing) return null;
        attempts += 1;
        return new AdminApiError("NETWORK_ERROR", 0);
      },
    });
    await screen.findByText("Validating rows");

    failing = true;
    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    const afterFirstFailure = attempts;
    await new Promise((resolve) => setTimeout(resolve, 250));

    // It stopped: a person's retry, or coming back to the tab, starts it again.
    expect(attempts).toBe(afterFirstFailure);
    expect(screen.getAllByText(/Couldn't reach the server/)).toHaveLength(1);
    // The rows it already had are still there.
    expect(screen.getByText("in-flight.csv")).toBeVisible();
  });
});
