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

import { AdminApiError } from "../admin-api-error";
import { navigation } from "../test-support/next-navigation";
import {
  TWO_LANGUAGES,
  minutesAgo,
  renderReviewList,
  reviewPage,
  reviewRow,
} from "./review-list-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const REVIEW_PATH = "/admin/curriculum/review";

/** Opens the review route at the given query string, as the address bar would. */
function visit(search = "language=lang-es") {
  navigation.reset(search, REVIEW_PATH);
}

beforeEach(() => {
  visit();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const table = () => screen.findByRole("table", { name: "Review queue" });

/**
 * Ways to dismiss a dialog without pressing one of its buttons. They are aimed
 * at the dialog itself, not at whatever has focus: the confirm button is
 * disabled mid-request, so focus has left it, and a keystroke sent "to the
 * page" would never reach the dialog — a test of the in-flight guard would
 * then pass for the wrong reason.
 */
const DISMISSALS: [string, () => void][] = [
  [
    "pressing Escape",
    () =>
      fireEvent.keyDown(screen.getByRole("dialog"), {
        key: "Escape",
        code: "Escape",
      }),
  ],
  [
    "clicking outside it",
    () => {
      const outside = document.querySelector(".MuiDialog-container")!;
      fireEvent.mouseDown(outside);
      fireEvent.click(outside);
    },
  ],
];

/** One new item and one edit, with every field the table shows. */
const MIXED = {
  "": reviewPage([
    reviewRow(1, {
      kind: "new",
      itemLabel: "amarillo",
      meaningLabel: "yellow",
      groupName: "Colors",
      updatedAt: minutesAgo(5),
      version: 2,
    }),
    reviewRow(2, {
      kind: "edit",
      itemLabel: "el gato",
      meaningLabel: "cat",
      groupName: "Animals",
      authorName: "Ada Lovelace",
      updatedAt: minutesAgo(180),
      version: 7,
    }),
  ]),
};

describe("ReviewListScreen — what is shown (parity with the queue it replaces)", () => {
  it("shows every fact the old list showed, in a table", async () => {
    renderReviewList({ pages: MIXED });
    const t = await table();

    const headers = within(t)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers.slice(0, 7)).toEqual([
      "Item",
      "Meaning",
      "Level",
      "Group",
      "Status",
      "Edited by",
      "Updated",
    ]);

    const [fresh, edit] = within(t).getAllByRole("row").slice(1);
    expect(within(fresh!).getByText("amarillo")).toBeVisible();
    expect(within(fresh!).getByText("yellow")).toBeVisible();
    expect(within(fresh!).getByText("Colors")).toBeVisible();
    expect(within(fresh!).getByText("5 minutes ago")).toBeVisible();

    expect(within(edit!).getByText("el gato")).toBeVisible();
    expect(within(edit!).getByText("Animals")).toBeVisible();
    expect(within(edit!).getByText("Ada Lovelace")).toBeVisible();
    expect(within(edit!).getByText("3 hours ago")).toBeVisible();
  });

  it("tells a new item apart from an edit to a published one", async () => {
    renderReviewList({ pages: MIXED });
    const [fresh, edit] = within(await table())
      .getAllByRole("row")
      .slice(1);

    expect(within(fresh!).getByText("Pending")).toBeVisible();
    expect(within(fresh!).getByText("New item")).toBeVisible();
    expect(within(edit!).getByText("Draft")).toBeVisible();
    expect(within(edit!).getByText("Edit to a published item")).toBeVisible();
  });

  it("shows no author for a new item", async () => {
    renderReviewList({ pages: MIXED });
    const [fresh] = within(await table())
      .getAllByRole("row")
      .slice(1);
    // Em-dashes: no group would also be "—"; this row has a group, so the
    // one dash is the author.
    expect(within(fresh!).getAllByText("—")).toHaveLength(1);
  });

  it("gives the exact time on hover and to assistive technology", async () => {
    const at = minutesAgo(5);
    renderReviewList({
      pages: { "": reviewPage([reviewRow(1, { updatedAt: at })]) },
    });
    const time = within(await table()).getByText("5 minutes ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", at);
    expect(time).toHaveAttribute("title");
  });

  it("links each item to its specialist editor", async () => {
    renderReviewList({ pages: MIXED });
    const t = await table();
    expect(within(t).getByRole("link", { name: "amarillo" })).toHaveAttribute(
      "href",
      "/admin/curriculum/items/item-1",
    );
    expect(within(t).getByRole("link", { name: "el gato" })).toHaveAttribute(
      "href",
      "/admin/curriculum/items/item-2",
    );
  });

  it("does not sort and shows no checkboxes — bulk publish is not reachable from here", async () => {
    renderReviewList({ pages: MIXED });
    const t = await table();
    expect(within(t).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(t).queryAllByRole("button", { name: /sort/i })).toHaveLength(
      0,
    );
  });

  it("asks the review endpoint for a bounded page of the URL's language", async () => {
    const { listRequests } = renderReviewList({ pages: MIXED });
    await table();
    expect(listRequests[0]).toBe("/review?language=lang-es&limit=20");
  });
});

describe("ReviewListScreen — who sees Publish (from the server's permissions)", () => {
  it("shows an admin a Publish button on every row", async () => {
    renderReviewList({ pages: MIXED, role: "admin" });
    await table();
    expect(
      await screen.findByRole("button", { name: "Publish amarillo" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Publish el gato" }),
    ).toBeVisible();
  });

  // Spec: "Keep writer's read visibility; hide/disable publish for writer".
  it("shows a writer the whole queue and no Publish button, with a note saying why", async () => {
    renderReviewList({ pages: MIXED, role: "writer" });
    const t = await table();

    expect(within(t).getByText("amarillo")).toBeVisible();
    expect(within(t).getByText("el gato")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull();
    expect(
      screen.getByText(
        "You can see everything waiting here. An Admin publishes it.",
      ),
    ).toBeVisible();
  });

  it("takes the button away when the role is revoked mid-session", async () => {
    const { setRole } = renderReviewList({ pages: MIXED, role: "admin" });
    await screen.findByRole("button", { name: "Publish amarillo" });

    setRole("writer");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Publish/ })).toBeNull(),
    );
    // They can still read the queue.
    expect(screen.getByText("amarillo")).toBeVisible();
  });

  it("shows a developer — who may not even read the queue — the access-denied panel, not an empty list", async () => {
    renderReviewList({
      pages: MIXED,
      role: "developer",
      failList: () => new AdminApiError("FORBIDDEN", 403),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Nothing is waiting")).toBeNull();
  });
});

describe("ReviewListScreen — states", () => {
  it("shows a labelled skeleton, then the table", async () => {
    renderReviewList({ pages: MIXED });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the review queue",
    );
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("treats an empty queue as the good outcome it is", async () => {
    renderReviewList({ pages: { "": reviewPage([]) } });
    expect(await screen.findByText("Nothing is waiting")).toBeVisible();
    expect(
      screen.getByText("Every item is either published or archived."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Browse the curriculum" }),
    ).toHaveAttribute("href", "/admin/curriculum");
  });

  it("tells a page past the end apart from an empty queue, with a way back", async () => {
    // A queue that shrinks as it is worked: everything after this cursor was published.
    visit("language=lang-es&cursor=gone");
    renderReviewList({
      pages: {
        gone: reviewPage([], { hasPreviousPage: true, previousCursor: null }),
      },
    });
    expect(
      await screen.findByText("There is nothing more on this page"),
    ).toBeVisible();
    expect(screen.queryByText("Nothing is waiting")).toBeNull();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderReviewList({
      pages: MIXED,
      failList: () =>
        failing ? new AdminApiError("INTERNAL_ERROR", 500) : null,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side",
    );
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await table()).toBeVisible();
  });

  it("sends a 401 to sign-in and shows no rows meanwhile", async () => {
    const { redirect } = renderReviewList({
      pages: MIXED,
      failList: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderReviewList({
      pages: MIXED,
      failList: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await table();

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["review"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByText("amarillo")).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderReviewList({
      pages: MIXED,
      failList: () => (revoked ? new AdminApiError("FORBIDDEN", 403) : null),
    });
    await table();

    revoked = true;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByText("amarillo")).toBeNull();
  });
});

describe("ReviewListScreen — paging by the server's cursors", () => {
  const pages = {
    "": reviewPage([reviewRow(1), reviewRow(2)], { nextCursor: "after-2" }),
    "after-2": reviewPage([reviewRow(3), reviewRow(4)], {
      hasPreviousPage: true,
      previousCursor: null,
    }),
  };

  it("moves forward by handing back the server's cursor, in the URL", async () => {
    const user = userEvent.setup();
    renderReviewList({ pages });
    await table();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum/review?language=lang-es&cursor=after-2",
      expect.anything(),
    );
    expect(await screen.findByText("palabra 3")).toBeVisible();
  });

  it("goes back to the first page without a cursor", async () => {
    const user = userEvent.setup();
    visit("language=lang-es&cursor=after-2");
    renderReviewList({ pages });
    await screen.findByText("palabra 3");

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenCalledWith(
      "/admin/curriculum/review?language=lang-es",
      expect.anything(),
    );
    expect(await screen.findByText("palabra 1")).toBeVisible();
  });

  it("offers no paging when the whole queue fits on one page", async () => {
    renderReviewList({ pages: MIXED });
    await table();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });
});

describe("ReviewListScreen — the language switch", () => {
  it("is not shown when there is only one language to choose", async () => {
    renderReviewList({ pages: MIXED });
    await table();
    expect(screen.queryByRole("combobox", { name: /Language/ })).toBeNull();
  });

  it("switches language, and starts again from the first page", async () => {
    const user = userEvent.setup();
    visit("language=lang-es&cursor=old");
    const { listRequests } = renderReviewList({
      languages: TWO_LANGUAGES,
      pages: {
        old: reviewPage([reviewRow(9)]),
        // French's own first page.
        "": reviewPage([reviewRow(1)]),
      },
    });
    await screen.findByText("palabra 9");

    await user.click(screen.getByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: "French" }));

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          // No cursor: it only means something under the language that made it.
          "/admin/curriculum/review?language=lang-fr",
          expect.anything(),
        ),
      { timeout: 3000 },
    );
    // The screen followed the address: French's first page, not Spanish's page 2.
    expect(await screen.findByText("palabra 1")).toBeVisible();
    expect(screen.queryByText("palabra 9")).toBeNull();
    expect(listRequests.at(-1)).toBe("/review?language=lang-fr&limit=20");
  });

  it("falls back to the first language for an unknown one in the URL", async () => {
    visit("language=not-a-language");
    const { listRequests } = renderReviewList({ pages: MIXED });
    await table();
    expect(listRequests[0]).toContain("language=lang-es");
  });
});

describe("ReviewListScreen — publishing asks first", () => {
  it("sends nothing until the Admin confirms, and says what will happen", async () => {
    const user = userEvent.setup();
    const { commands } = renderReviewList({ pages: MIXED });

    await user.click(
      await screen.findByRole("button", { name: "Publish el gato" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Publish “el gato”?",
    });
    expect(
      within(dialog).getByText(
        "This will replace the currently live content with the edited version. Existing learner progress stays attached to this item.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByText("Ada Lovelace")).toBeVisible();
    expect(within(dialog).getByText("Level 1 · Animals")).toBeVisible();
    // Opening the dialog changed nothing.
    expect(commands).toEqual([]);
  });

  it("describes a new item's impact differently from an edit's", async () => {
    const user = userEvent.setup();
    renderReviewList({ pages: MIXED });

    await user.click(
      await screen.findByRole("button", { name: "Publish amarillo" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "This item will become visible to learners for the first time.",
      ),
    ).toBeVisible();
    // A new item has no author line.
    expect(within(dialog).queryByText("Edited by")).toBeNull();
  });

  it("changes nothing when cancelled", async () => {
    const user = userEvent.setup();
    const { commands } = renderReviewList({ pages: MIXED });
    await user.click(
      await screen.findByRole("button", { name: "Publish amarillo" }),
    );
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toEqual([]);
    expect(screen.getByText("amarillo")).toBeVisible();
  });

  it.each(DISMISSALS)(
    "closes by %s when nothing is in flight",
    async (_how, dismiss) => {
      const user = userEvent.setup();
      const { commands } = renderReviewList({ pages: MIXED });
      await user.click(
        await screen.findByRole("button", { name: "Publish amarillo" }),
      );
      await screen.findByRole("dialog");

      dismiss();

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toEqual([]);
    },
  );
});

describe("ReviewListScreen — the publish command", () => {
  async function openAndConfirm(
    user: ReturnType<typeof userEvent.setup>,
    label = "amarillo",
  ) {
    await user.click(
      await screen.findByRole("button", { name: `Publish ${label}` }),
    );
    await user.click(
      await within(await screen.findByRole("dialog")).findByRole("button", {
        name: "Publish",
      }),
    );
  }

  it("sends the item, the version the Admin saw, and a fresh UUID — and no actor", async () => {
    const user = userEvent.setup();
    const { commands } = renderReviewList({ pages: MIXED });

    await openAndConfirm(user, "el gato");

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({
      itemId: "item-2",
      expectedVersion: 7,
      idempotencyKey: expect.stringMatching(UUID),
    });
    expect(Object.keys(commands[0]!).sort()).toEqual([
      "expectedVersion",
      "idempotencyKey",
      "itemId",
    ]);
  });

  it("closes, announces the result, and re-reads the queue after a success", async () => {
    const user = userEvent.setup();
    const pages = { ...MIXED };
    const { listRequests } = renderReviewList({
      pages,
      publish: async (body) => {
        // The queue lost the row, as the real one does.
        pages[""] = reviewPage(
          pages[""]!.items.filter((row) => row.id !== body.itemId),
        );
        return { itemId: body.itemId };
      },
    });
    await table();
    const before = listRequests.length;

    await openAndConfirm(user, "amarillo");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Published “amarillo”")).toBeVisible();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText("amarillo")).toBeNull());
    expect(screen.getByText("el gato")).toBeVisible();
  });

  it("marks the queue, the curriculum list, and the Overview stale", async () => {
    const user = userEvent.setup();
    const { invalidate } = renderReviewList({ pages: MIXED });
    await openAndConfirm(user);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const keys = invalidate.mock.calls.map(
      (call) => (call[0] as { queryKey: string[] }).queryKey[0],
    );
    expect(keys).toEqual(
      expect.arrayContaining(["review", "curriculum", "overview"]),
    );
  });

  it("shows 'Publishing…' and refuses a second click while the request is in flight", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { commands } = renderReviewList({
      pages: MIXED,
      publish: async (body) => {
        await gate;
        return { itemId: body.itemId };
      },
    });

    await openAndConfirm(user);

    const busy = await screen.findByRole("button", { name: "Publishing…" });
    expect(busy).toBeDisabled();
    // A real pointer cannot reach it (MUI sets `pointer-events: none`), so
    // go around the pointer: even a synthetic click must not send a second one.
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(commands).toHaveLength(1);

    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toHaveLength(1);
  });

  it.each(DISMISSALS)(
    "cannot be dismissed by %s while a request is in flight",
    async (_how, dismiss) => {
      const user = userEvent.setup();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      renderReviewList({
        pages: MIXED,
        publish: async (body) => {
          await gate;
          return { itemId: body.itemId };
        },
      });
      await openAndConfirm(user);
      await screen.findByRole("button", { name: "Publishing…" });

      dismiss();
      expect(screen.getByRole("dialog")).toBeVisible();

      release();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );

  describe("idempotency", () => {
    it("reuses one key for every attempt while the dialog stays open", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const { commands } = renderReviewList({
        pages: MIXED,
        publish: async (body) => {
          attempts += 1;
          // The first answer is lost on the way back.
          if (attempts === 1) throw new AdminApiError("NETWORK_ERROR", 0);
          return { itemId: body.itemId };
        },
      });

      await openAndConfirm(user);
      expect(
        await screen.findByText(/Couldn't reach the server/),
      ).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Try again" }));

      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]!.idempotencyKey).toBe(commands[0]!.idempotencyKey);
      // Same item, same version: a genuine retry of one intent.
      expect(commands[1]).toEqual(commands[0]);
    });

    it("uses a new key each time the dialog is opened", async () => {
      const user = userEvent.setup();
      const { commands } = renderReviewList({
        pages: MIXED,
        publish: async () => {
          throw new AdminApiError("NETWORK_ERROR", 0);
        },
      });

      await openAndConfirm(user);
      await screen.findByText(/Couldn't reach the server/);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      await openAndConfirm(user);
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]!.idempotencyKey).not.toBe(commands[0]!.idempotencyKey);
    });
  });

  describe("when the server says no", () => {
    it("explains a stale version and offers only Reload — never a blind retry", async () => {
      const user = userEvent.setup();
      const { listRequests, commands } = renderReviewList({
        pages: MIXED,
        publish: async () => {
          throw new AdminApiError("CONFLICT", 409, undefined, {
            serverMessage:
              "This item changed after you opened it. Reload the latest version before saving or publishing.",
          });
        },
      });
      await table();
      const before = listRequests.length;

      await openAndConfirm(user);

      const dialog = await screen.findByRole("dialog");
      expect(
        await within(dialog).findByText(/changed after you opened it/),
      ).toBeVisible();
      expect(
        within(dialog).queryByRole("button", { name: "Publish" }),
      ).toBeNull();
      expect(
        within(dialog).queryByRole("button", { name: "Try again" }),
      ).toBeNull();

      await user.click(within(dialog).getByRole("button", { name: "Reload" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(listRequests.length).toBeGreaterThan(before));
      // Reloading re-read the queue; it did not resend the command.
      expect(commands).toHaveLength(1);
    });

    it.each([
      [
        "the item is gone",
        new AdminApiError("NOT_FOUND", 404, undefined, {
          serverMessage: "That curriculum item could not be found.",
        }),
        /could not be found/,
      ],
      [
        "there is nothing left to publish",
        new AdminApiError("VALIDATION_FAILED", 422, undefined, {
          serverMessage: "There are no unpublished changes to publish.",
        }),
        /no unpublished changes/,
      ],
    ])("offers Reload when %s", async (_name, failure, text) => {
      const user = userEvent.setup();
      renderReviewList({
        pages: MIXED,
        publish: async () => {
          throw failure;
        },
      });
      await openAndConfirm(user);
      const dialog = await screen.findByRole("dialog");
      expect(await within(dialog).findByText(text)).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Reload" }),
      ).toBeVisible();
    });

    it("offers only Close when the Admin is no longer allowed to publish", async () => {
      const user = userEvent.setup();
      renderReviewList({
        pages: MIXED,
        publish: async () => {
          throw new AdminApiError("FORBIDDEN", 403);
        },
      });
      await openAndConfirm(user);

      const dialog = await screen.findByRole("dialog");
      expect(
        await within(dialog).findByText(
          "You don't have access to this part of the admin console.",
        ),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toBeVisible();
      expect(
        within(dialog).queryByRole("button", { name: /Publish|Try again/ }),
      ).toBeNull();
    });

    it("tells a rate-limited Admin how long to wait, and lets them try again", async () => {
      const user = userEvent.setup();
      renderReviewList({
        pages: MIXED,
        publish: async () => {
          throw new AdminApiError("RATE_LIMITED", 429, undefined, {
            serverMessage: "Please slow down and try again in 17s.",
            retryAfterSeconds: 17,
          });
        },
      });
      await openAndConfirm(user);

      const dialog = await screen.findByRole("dialog");
      expect(
        await within(dialog).findByText(
          "Please slow down and try again in 17s.",
        ),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Try again" }),
      ).toBeEnabled();
    });

    it("never shows a server fault's own text", async () => {
      const user = userEvent.setup();
      renderReviewList({
        pages: MIXED,
        publish: async () => {
          throw new AdminApiError("INTERNAL_ERROR", 500, undefined, {
            serverMessage: "deadlock detected on learning_items",
          });
        },
      });
      await openAndConfirm(user);
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByText(/Something went wrong on our side/);
      expect(dialog).not.toHaveTextContent("learning_items");
    });
  });
});
