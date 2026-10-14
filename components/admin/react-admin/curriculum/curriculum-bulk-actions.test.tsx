import { act, screen, waitFor, within } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRICULUM_BULK_ITEM_LIMIT } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { navigation } from "../test-support/next-navigation";
import {
  page,
  renderCurriculumList,
  row,
  type CommandHandler,
} from "./curriculum-list-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

beforeEach(() => {
  navigation.reset();
});

/**
 * Spec 26 Unit 7: the bulk bar and its three confirmations, over the real
 * React Admin provider, the real data provider and a scripted API. What these
 * pin is what the person is told before anything is sent, exactly what is
 * sent (and under which idempotency key), and what happens after each answer.
 */

const PUBLISH = "/curriculum/bulk-publish";
const ARCHIVE = "/curriculum/bulk-archive";
const MOVE = "/curriculum/bulk-move";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOOLBAR = { name: "Actions for the selected items" };

/** The checkbox of the row whose item link reads `label`. */
function checkboxOf(label: string) {
  const tableRow = screen.getByRole("link", { name: label }).closest("tr")!;
  return within(tableRow).getByRole("checkbox");
}

/** Waits for the table, then ticks each named row. */
async function selectRows(
  user: ReturnType<typeof userEvent.setup>,
  ...labels: string[]
) {
  await screen.findByRole("table");
  for (const label of labels) await user.click(checkboxOf(label));
  await screen.findByRole("group", TOOLBAR);
}

const toolbar = () => screen.getByRole("group", TOOLBAR);
const action = (name: string) =>
  within(toolbar()).getByRole("button", { name });

async function openDialog(
  user: ReturnType<typeof userEvent.setup>,
  button: string,
  title: string | RegExp,
) {
  await user.click(action(button));
  return screen.findByRole("dialog", { name: title });
}

/** A handler that records nothing and answers with the ids it was sent, as the server does for a clean batch. */
const echo =
  (key: string): CommandHandler =>
  (body) => ({ [key]: body.itemIds });

const refusal = (code: string, status: number, serverMessage?: string) =>
  new AdminApiError(code, status, undefined, { serverMessage });

/* ------------------------------------------------------------------------- */

describe("the bar", () => {
  const pages = {
    "": page([
      row(1, { itemLabel: "gato", status: "pending" }),
      row(2, { itemLabel: "perro", status: "published" }),
    ]),
  };

  it("offers publish, move to a level, move to a group and archive — and nothing that deletes", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato");

    expect(
      within(toolbar())
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "", // Unselect
      "Publish",
      "Move to level",
      "Move to group",
      "Archive",
    ]);
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("counts what is selected, and follows it", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato");
    expect(toolbar()).toHaveTextContent("1 item selected");

    await user.click(checkboxOf("perro"));
    expect(toolbar()).toHaveTextContent("2 items selected");
  });
});

/* ------------------------------------------------------------------------- */

describe("publish", () => {
  const pages = {
    "": page([
      row(1, { itemLabel: "gato", status: "pending" }),
      row(2, { itemLabel: "perro", status: "pending", type: "grammar" }),
      row(3, { itemLabel: "casa", status: "published" }),
      row(4, { itemLabel: "agua", status: "draft" }),
      row(5, { itemLabel: "viejo", status: "archived" }),
    ]),
  };

  it("is offered when everything selected is Pending", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato", "perro");

    expect(action("Publish")).toBeEnabled();
    expect(screen.queryByText(/Publish needs every selected item/)).toBeNull();
  });

  it.each([
    ["published", "casa"],
    ["with unpublished changes", "agua"],
    ["archived", "viejo"],
  ])(
    "is not offered when one selected item is %s, and says why",
    async (_status, label) => {
      const user = userEvent.setup();
      renderCurriculumList({ pages });
      await selectRows(user, "gato", label);

      expect(action("Publish")).toBeDisabled();
      expect(toolbar()).toHaveTextContent(
        "Publish needs every selected item to be Pending — 1 isn't.",
      );
    },
  );

  it("offers to narrow the selection to the Pending ones — the person chooses, nothing is sent for a subset", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({ pages });
    await selectRows(user, "gato", "perro", "casa");
    expect(toolbar()).toHaveTextContent(
      "Publish needs every selected item to be Pending — 1 isn't.",
    );

    await user.click(
      within(toolbar()).getByRole("button", {
        name: "Select only the 2 Pending",
      }),
    );

    await waitFor(() =>
      expect(toolbar()).toHaveTextContent("2 items selected"),
    );
    expect(checkboxOf("casa")).not.toBeChecked();
    expect(checkboxOf("gato")).toBeChecked();
    expect(action("Publish")).toBeEnabled();
    expect(screen.queryByText(/Publish needs every selected item/)).toBeNull();
    expect(commandCalls).toHaveLength(0);
  });

  it("has nothing to narrow to when none is Pending", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "casa", "viejo");

    expect(action("Publish")).toBeDisabled();
    expect(toolbar()).toHaveTextContent(
      "Publish needs every selected item to be Pending — 2 aren't.",
    );
    expect(
      within(toolbar()).queryByRole("button", { name: /Select only/ }),
    ).toBeNull();
  });

  it("asks first, names what will be published, and sends nothing until confirmed", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: { [PUBLISH]: echo("publishedItemIds") },
    });
    await selectRows(user, "gato", "perro");

    const dialog = await openDialog(user, "Publish", "Publish 2 items?");

    expect(dialog).toHaveTextContent(
      "These items become visible to learners for the first time. All publish together, or none do.",
    );
    const items = within(
      within(dialog).getByRole("list", { name: "Items to publish" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("gato");
    expect(items[0]).toHaveTextContent("Vocabulary");
    expect(items[1]).toHaveTextContent("perro");
    expect(items[1]).toHaveTextContent("Grammar");
    expect(commandCalls).toHaveLength(0);
  });

  it("cancelling sends nothing and keeps the selection", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({ pages });
    await selectRows(user, "gato");

    const dialog = await openDialog(user, "Publish", "Publish 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commandCalls).toHaveLength(0);
    expect(toolbar()).toHaveTextContent("1 item selected");
  });

  it("sends exactly the selection, in the list's language, under a fresh key — then says so, clears the selection and re-reads the list", async () => {
    const user = userEvent.setup();
    const { commandCalls, requests, queryClient } = renderCurriculumList({
      pages,
      commands: { [PUBLISH]: echo("publishedItemIds") },
    });
    await selectRows(user, "gato", "perro");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const reads = requests.length;

    const dialog = await openDialog(user, "Publish", "Publish 2 items?");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Published 2 items.")).toBeVisible();
    expect(commandCalls).toEqual([
      {
        path: PUBLISH,
        body: {
          languageId: "lang-es",
          itemIds: ["item-1", "item-2"],
          idempotencyKey: expect.stringMatching(UUID),
        },
      },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).not.toBeChecked();
    }
    // The list is read again — and everything else that shows these items'
    // statuses is marked stale.
    await waitFor(() => expect(requests.length).toBeGreaterThan(reads));
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([["curriculum"], ["review"], ["overview"]]),
    );
  });

  it("acts in the language the list is showing", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-fr");
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: { [PUBLISH]: echo("publishedItemIds") },
    });
    await selectRows(user, "gato");

    const dialog = await openDialog(user, "Publish", "Publish 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(commandCalls).toHaveLength(1));
    expect(commandCalls[0]!.body.languageId).toBe("lang-fr");
  });

  it("cannot be dismissed, or sent twice, while the request is in flight", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [PUBLISH]: async (body) => {
          await gate;
          return { publishedItemIds: body.itemIds };
        },
      },
    });
    await selectRows(user, "gato");
    const dialog = await openDialog(user, "Publish", "Publish 1 item?");

    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    const sending = await within(dialog).findByRole("button", {
      name: "Publishing…",
    });
    expect(sending).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    // Neither Escape (pressed with focus inside the dialog, as a person would)
    // nor a click outside it dismisses it, and the one button that could send
    // again is disabled (it takes no pointer events at all).
    within(dialog).getByRole("list", { name: "Items to publish" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(document.querySelector(".MuiDialog-container")!);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(commandCalls).toHaveLength(1);

    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  describe("when the server says the selection is out of date", () => {
    it.each([
      ["CONFLICT", 409, "Some of the selected items are no longer Pending."],
      ["NOT_FOUND", 404, "One of the selected items no longer exists."],
      [
        "VALIDATION_FAILED",
        422,
        "Some of the selected items aren't in this language.",
      ],
    ])(
      "(%s) says so in the dialog, offers only to reload, and sends nothing again",
      async (code, status, message) => {
        const user = userEvent.setup();
        const { commandCalls, requests } = renderCurriculumList({
          pages,
          commands: {
            [PUBLISH]: () => {
              throw refusal(code, status, message);
            },
          },
        });
        await selectRows(user, "gato");
        const dialog = await openDialog(user, "Publish", "Publish 1 item?");
        await user.click(
          within(dialog).getByRole("button", { name: "Publish" }),
        );

        expect(await within(dialog).findByRole("alert")).toHaveTextContent(
          message,
        );
        // Never a blind retry of a view that is now wrong.
        expect(
          within(dialog).queryByRole("button", { name: "Try again" }),
        ).toBeNull();
        expect(
          within(dialog).queryByRole("button", { name: "Publish" }),
        ).toBeNull();

        const reads = requests.length;
        await user.click(
          within(dialog).getByRole("button", { name: "Reload the list" }),
        );

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
        await waitFor(() => expect(requests.length).toBeGreaterThan(reads));
        // The level and group choices are the server page's: ask it again too.
        expect(navigation.refresh).toHaveBeenCalled();
        expect(commandCalls).toHaveLength(1);
      },
    );
  });

  it("offers only Close, as a warning, when the Admin is no longer allowed", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [PUBLISH]: () => {
          throw refusal("FORBIDDEN", 403);
        },
      },
    });
    await selectRows(user, "gato");
    const dialog = await openDialog(user, "Publish", "Publish 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(
      within(dialog).queryByRole("button", { name: "Try again" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Reload the list" }),
    ).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commandCalls).toHaveLength(1);
  });

  it("retries a lost answer under the same key, so the server can answer from what it stored", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [PUBLISH]: (body) => {
          attempt += 1;
          if (attempt === 1) throw refusal("NETWORK_ERROR", 0);
          return { publishedItemIds: body.itemIds };
        },
      },
    });
    await selectRows(user, "gato");
    const dialog = await openDialog(user, "Publish", "Publish 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Couldn't reach the server",
    );
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Published 1 item.")).toBeVisible();
    expect(commandCalls).toHaveLength(2);
    expect(commandCalls[1]!.body).toEqual(commandCalls[0]!.body);
    expect(commandCalls[0]!.body.idempotencyKey).toMatch(UUID);
  });

  it("shows the server's own wait when commands come too fast, and lets the person try again", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [PUBLISH]: () => {
          throw refusal(
            "RATE_LIMITED",
            429,
            "Please slow down and try again in 9s.",
          );
        },
      },
    });
    await selectRows(user, "gato");
    const dialog = await openDialog(user, "Publish", "Publish 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Please slow down and try again in 9s.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Try again" }),
    ).toBeEnabled();
    expect(commandCalls).toHaveLength(1);
  });

  it("never shows a server fault's own words", async () => {
    const user = userEvent.setup();
    renderCurriculumList({
      pages,
      commands: {
        [PUBLISH]: () => {
          throw refusal(
            "INTERNAL_ERROR",
            500,
            "deadlock detected on learning_items_pkey",
          );
        },
      },
    });
    await selectRows(user, "gato");
    const dialog = await openDialog(user, "Publish", "Publish 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Publish" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong on our side");
    expect(alert).not.toHaveTextContent("learning_items_pkey");
  });
});

/* ------------------------------------------------------------------------- */

describe("archive", () => {
  const pages = {
    "": page([
      row(1, { itemLabel: "gato", status: "pending" }),
      row(2, { itemLabel: "casa", status: "published" }),
      row(3, { itemLabel: "agua", status: "draft" }),
      row(4, { itemLabel: "viejo", status: "archived" }),
      row(5, { itemLabel: "antiguo", status: "archived" }),
    ]),
  };

  it("is offered for any selection, even one that includes archived items", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato", "viejo");
    expect(action("Archive")).toBeEnabled();
  });

  it("says what archiving will do to this selection before it is sent", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({ pages });
    await selectRows(user, "gato", "casa", "agua", "viejo");

    const dialog = await openDialog(user, "Archive", "Archive 3 items?");

    expect(dialog).toHaveTextContent(
      "Archiving withdraws items from learners' browsing and from new lessons.",
    );
    expect(dialog).toHaveTextContent("Learner progress is kept");
    expect(dialog).toHaveTextContent("All archive together, or none do.");
    expect(dialog).toHaveTextContent(
      "2 items are live to learners and will be withdrawn from them.",
    );
    expect(dialog).toHaveTextContent(
      "1 item has unpublished changes, which archiving discards.",
    );
    expect(dialog).toHaveTextContent(
      "1 item is already archived and will be left as it is.",
    );
    expect(
      within(
        within(dialog).getByRole("list", { name: "Items to archive" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(4);
    expect(commandCalls).toHaveLength(0);
  });

  it("sends every selected item — the server leaves the archived ones alone — and reports both counts", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [ARCHIVE]: () => ({
          archivedItemIds: ["item-1", "item-2"],
          alreadyArchivedItemIds: ["item-4"],
        }),
      },
    });
    await selectRows(user, "gato", "casa", "viejo");

    const dialog = await openDialog(user, "Archive", "Archive 2 items?");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(
      await screen.findByText("Archived 2 items (1 already archived)."),
    ).toBeVisible();
    expect(commandCalls).toEqual([
      {
        path: ARCHIVE,
        body: {
          languageId: "lang-es",
          itemIds: ["item-1", "item-2", "item-4"],
          idempotencyKey: expect.stringMatching(UUID),
        },
      },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("group", TOOLBAR)).toBeNull(),
    );
  });

  it("is styled as the warning it is", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "casa");
    const dialog = await openDialog(user, "Archive", "Archive 1 item?");

    expect(within(dialog).getByRole("button", { name: "Archive" })).toHaveClass(
      "MuiButton-colorError",
    );
  });

  it("has nothing to confirm when everything selected is already archived", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({ pages });
    await selectRows(user, "viejo", "antiguo");

    const dialog = await openDialog(user, "Archive", "Nothing to archive");

    expect(dialog).toHaveTextContent(
      "All 2 selected items are already archived.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Archive" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(commandCalls).toHaveLength(0);
  });

  it("explains a refusal for an item that has gone, offering to reload", async () => {
    const user = userEvent.setup();
    renderCurriculumList({
      pages,
      commands: {
        [ARCHIVE]: () => {
          throw refusal(
            "NOT_FOUND",
            404,
            "One of the selected items no longer exists. Reload the list and try again.",
          );
        },
      },
    });
    await selectRows(user, "casa");
    const dialog = await openDialog(user, "Archive", "Archive 1 item?");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "One of the selected items no longer exists.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Reload the list" }),
    ).toBeVisible();
  });
});

/* ------------------------------------------------------------------------- */

describe("move to a level", () => {
  const pages = {
    "": page([
      row(1, {
        itemLabel: "gato",
        status: "published",
        groupId: "group-a",
        groupName: "Animals",
      }),
      row(2, {
        itemLabel: "perro",
        status: "pending",
        groupId: "group-a",
        groupName: "Animals",
      }),
      row(3, {
        itemLabel: "porque",
        type: "grammar",
        status: "published",
        groupId: "group-a",
        groupName: "Animals",
      }),
      row(4, {
        itemLabel: "rojo",
        levelId: "level-2",
        levelNumber: 2,
        status: "published",
      }),
    ]),
  };

  async function chooseTarget(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    label: RegExp | string,
    option: string,
  ) {
    await user.click(within(dialog).getByRole("combobox", { name: label }));
    await user.click(await screen.findByRole("option", { name: option }));
  }

  it("offers the language's levels, and asks nothing to be sent until one is chosen", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato", "perro");

    const dialog = await openDialog(
      user,
      "Move to level",
      "Move 2 items to a level",
    );

    expect(dialog).toHaveTextContent(
      "Existing learner progress stays with each item.",
    );
    expect(within(dialog).getByRole("button", { name: "Move" })).toBeDisabled();
    await user.click(
      within(dialog).getByRole("combobox", { name: "Target level" }),
    );
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Level 1", "Level 2"]);
  });

  it("says where the items go, and what else happens, once a level is chosen", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato", "perro", "porque", "rojo");
    const dialog = await openDialog(
      user,
      "Move to level",
      "Move 4 items to a level",
    );

    await chooseTarget(user, dialog, "Target level", "Level 2");

    expect(dialog).toHaveTextContent(
      "3 items will move to Level 2, to the end of its order.",
    );
    expect(dialog).toHaveTextContent(
      "1 item already in Level 2 is left where it is.",
    );
    expect(dialog).toHaveTextContent(
      "2 items are live to learners and will change level for them straight away.",
    );
    expect(dialog).toHaveTextContent(
      "1 grammar item filed under a group will lose it — a group belongs to one level.",
    );
    expect(dialog).toHaveTextContent(
      "Vocabulary keeps its group; use Move to group to change that.",
    );
    expect(within(dialog).getByRole("button", { name: "Move" })).toBeEnabled();
  });

  it("sends every selected item and the level, and reports what moved and what was already there", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [MOVE]: () => ({
          movedItemIds: ["item-1"],
          unchangedItemIds: ["item-4"],
        }),
      },
    });
    await selectRows(user, "gato", "rojo");
    const dialog = await openDialog(
      user,
      "Move to level",
      "Move 2 items to a level",
    );
    await chooseTarget(user, dialog, "Target level", "Level 2");

    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(
      await screen.findByText("Moved 1 item to Level 2 (1 already there)."),
    ).toBeVisible();
    expect(commandCalls).toEqual([
      {
        path: MOVE,
        body: {
          languageId: "lang-es",
          itemIds: ["item-1", "item-4"],
          levelId: "level-2",
          idempotencyKey: expect.stringMatching(UUID),
        },
      },
    ]);
    // A level move names no group.
    expect(commandCalls[0]!.body).not.toHaveProperty("groupId");
    await waitFor(() =>
      expect(screen.queryByRole("group", TOOLBAR)).toBeNull(),
    );
  });

  it("has nothing to confirm when everything is already in that level", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({ pages });
    await selectRows(user, "gato", "perro");
    const dialog = await openDialog(
      user,
      "Move to level",
      "Move 2 items to a level",
    );

    await chooseTarget(user, dialog, "Target level", "Level 1");

    expect(dialog).toHaveTextContent(
      "All 2 selected items are already in Level 1. Nothing will change.",
    );
    expect(within(dialog).getByRole("button", { name: "Move" })).toBeDisabled();
    expect(commandCalls).toHaveLength(0);
  });

  it("points to the specialist ordering tool, and does not arrange anything itself", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato");
    const dialog = await openDialog(
      user,
      "Move to level",
      "Move 1 item to a level",
    );

    await chooseTarget(user, dialog, "Target level", "Level 2");

    expect(dialog).toHaveTextContent("to the end of its order");
    // The order is arranged on the level's own page — a link, not a copy of its
    // controls.
    expect(
      within(dialog).getByRole("link", { name: "Level 2's page" }),
    ).toHaveAttribute("href", "/admin/curriculum/levels/level-2");
    expect(
      within(dialog).queryByRole("button", { name: /up|down|reorder/i }),
    ).toBeNull();
  });

  it("offers no link when nothing will move", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato");
    const dialog = await openDialog(
      user,
      "Move to level",
      "Move 1 item to a level",
    );

    await chooseTarget(user, dialog, "Target level", "Level 1");

    expect(within(dialog).queryByRole("link")).toBeNull();
  });
});

/* ------------------------------------------------------------------------- */

describe("move to a group", () => {
  const pages = {
    "": page([
      row(1, { itemLabel: "gato" }),
      row(2, { itemLabel: "perro", groupId: "group-a", groupName: "Animals" }),
      row(3, { itemLabel: "porque", type: "grammar" }),
    ]),
  };

  async function chooseGroup(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    option: string,
  ) {
    await user.click(
      within(dialog).getByRole("combobox", { name: "Target group" }),
    );
    await user.click(await screen.findByRole("option", { name: option }));
  }

  it("offers the language's groups, labelled by level", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato");
    const dialog = await openDialog(
      user,
      "Move to group",
      "Move 1 item to a group",
    );

    await user.click(
      within(dialog).getByRole("combobox", { name: "Target group" }),
    );

    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["L1 — Animals", "L2 — Colors"]);
  });

  it("files vocabulary and grammar alike, naming the group and what is already in it", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "gato", "perro", "porque");
    const dialog = await openDialog(
      user,
      "Move to group",
      "Move 3 items to a group",
    );

    await chooseGroup(user, dialog, "L1 — Animals");

    expect(dialog).toHaveTextContent("2 items will be filed under “Animals”.");
    expect(dialog).toHaveTextContent(
      "1 item already in “Animals” is left where it is.",
    );
  });

  it("says when an item is in a different level from the group, and sends the group as groupId", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [MOVE]: (body) => ({
          movedItemIds: body.itemIds,
          unchangedItemIds: [],
        }),
      },
    });
    await selectRows(user, "gato", "porque");
    const dialog = await openDialog(
      user,
      "Move to group",
      "Move 2 items to a group",
    );

    await chooseGroup(user, dialog, "L2 — Colors");

    expect(dialog).toHaveTextContent(
      "2 items are in a different level from this group (Level 2); they stay where they are.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(await screen.findByText("Moved 2 items to “Colors”.")).toBeVisible();
    expect(commandCalls[0]).toEqual({
      path: MOVE,
      body: {
        languageId: "lang-es",
        itemIds: ["item-1", "item-3"],
        groupId: "group-b",
        idempotencyKey: expect.stringMatching(UUID),
      },
    });
    expect(commandCalls[0]!.body).not.toHaveProperty("levelId");
  });

  it("has nothing to confirm when everything is already in that group", async () => {
    const user = userEvent.setup();
    renderCurriculumList({ pages });
    await selectRows(user, "perro");
    const dialog = await openDialog(
      user,
      "Move to group",
      "Move 1 item to a group",
    );

    await chooseGroup(user, dialog, "L1 — Animals");

    expect(dialog).toHaveTextContent(
      "The selected item is already in “Animals”. Nothing will change.",
    );
    expect(within(dialog).getByRole("button", { name: "Move" })).toBeDisabled();
  });

  it("keeps the same key for the same request and takes a new one for a changed request", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const { commandCalls } = renderCurriculumList({
      pages,
      commands: {
        [MOVE]: (body) => {
          attempt += 1;
          if (attempt <= 2) throw refusal("INTERNAL_ERROR", 500);
          return { movedItemIds: body.itemIds, unchangedItemIds: [] };
        },
      },
    });
    await selectRows(user, "gato");
    const dialog = await openDialog(
      user,
      "Move to group",
      "Move 1 item to a group",
    );

    await chooseGroup(user, dialog, "L1 — Animals");
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    await within(dialog).findByRole("alert");
    // The same request again: the same key.
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(commandCalls).toHaveLength(2));
    // A different group is a different request: a new key.
    await chooseGroup(user, dialog, "L2 — Colors");
    await user.click(
      within(dialog).getByRole("button", { name: /Try again|Move/ }),
    );
    await waitFor(() => expect(commandCalls).toHaveLength(3));

    const keys = commandCalls.map((call) => call.body.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(commandCalls.map((call) => call.body.groupId)).toEqual([
      "group-a",
      "group-a",
      "group-b",
    ]);
  });
});

/* ------------------------------------------------------------------------- */

describe("when the person's role changes underneath the page", () => {
  it("takes selection away on the next permission read, and with it any question being asked", async () => {
    const user = userEvent.setup();
    let role: "admin" | "writer" = "admin";
    const { commandCalls } = renderCurriculumList({
      pages: { "": page([row(1, { itemLabel: "gato" })]) },
      role: () => role,
    });
    await selectRows(user, "gato");
    await openDialog(user, "Archive", "Archive 1 item?");

    // Demoted elsewhere; the tab comes back to the front.
    role = "writer";
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(commandCalls).toHaveLength(0);
    // The list itself is still theirs to read.
    expect(screen.getByRole("link", { name: "gato" })).toBeVisible();
  });
});

describe("the selection's limits and scope", () => {
  it(`takes up to ${CURRICULUM_BULK_ITEM_LIMIT} items, and no more`, async () => {
    const user = userEvent.setup();
    const many = (count: number) =>
      page(
        Array.from({ length: count }, (_, index) =>
          row(index + 1, { status: "pending" }),
        ),
      );

    const exactly = renderCurriculumList({
      pages: { "": many(CURRICULUM_BULK_ITEM_LIMIT) },
    });
    await screen.findByRole("table");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    await screen.findByRole("group", TOOLBAR);
    expect(toolbar()).toHaveTextContent(
      `${CURRICULUM_BULK_ITEM_LIMIT} items selected`,
    );
    for (const name of [
      "Publish",
      "Move to level",
      "Move to group",
      "Archive",
    ]) {
      expect(action(name)).toBeEnabled();
    }
    exactly.unmount();

    renderCurriculumList({
      pages: { "": many(CURRICULUM_BULK_ITEM_LIMIT + 1) },
    });
    await screen.findByRole("table");
    await user.click(screen.getAllByRole("checkbox")[0]!);
    await screen.findByRole("group", TOOLBAR);
    expect(toolbar()).toHaveTextContent(
      `${CURRICULUM_BULK_ITEM_LIMIT + 1} items selected`,
    );
    for (const name of [
      "Publish",
      "Move to level",
      "Move to group",
      "Archive",
    ]) {
      expect(action(name)).toBeDisabled();
    }
    expect(toolbar()).toHaveTextContent(
      `These actions take up to ${CURRICULUM_BULK_ITEM_LIMIT} items at a time — ${CURRICULUM_BULK_ITEM_LIMIT + 1} are selected.`,
    );
  });

  it("closes the question when the selection it was about is gone — a decision made on one view is not carried to another", async () => {
    const user = userEvent.setup();
    const { commandCalls } = renderCurriculumList({
      pages: { "": page([row(1, { itemLabel: "gato" })]) },
    });
    await selectRows(user, "gato");
    await openDialog(user, "Archive", "Archive 1 item?");

    // The browser's Back button, say: the URL changes under the open dialog.
    act(() => navigation.go("/admin/curriculum?language=lang-es&status=draft"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
    expect(commandCalls).toHaveLength(0);
  });

  it("does not offer a second command while one is being asked about", async () => {
    const user = userEvent.setup();
    renderCurriculumList({
      pages: { "": page([row(1, { itemLabel: "gato" })]) },
    });
    await selectRows(user, "gato");
    await openDialog(user, "Archive", "Archive 1 item?");

    // The dialog is modal: the bar behind it is out of reach.
    expect(screen.queryByRole("group", TOOLBAR)).toBeNull();
  });
});
