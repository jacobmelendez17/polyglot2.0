import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_LIST_PAGE_SIZE, USER_ROLE_REASON_MAX } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { DISMISSALS } from "../test-support/dialog-dismissals";
import { navigation } from "../test-support/next-navigation";
import { USERS_PATH } from "./user-list-params";
import { UsersListScreen } from "./users-list-screen";
import {
  ME,
  meRow,
  pageKey,
  renderWithUsersApi,
  userPage,
  userRow,
} from "./users-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

beforeEach(() => {
  navigation.reset("", USERS_PATH);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Options = Parameters<typeof renderWithUsersApi>[1];

function renderScreen(script: Options = {}) {
  return renderWithUsersApi(
    () => <UsersListScreen currentUserId={ME} />,
    script,
  );
}

const table = () => screen.findByRole("table", { name: "Users" });
const rowOf = async (name: string) =>
  within(await table())
    .getByText(name)
    .closest("tr")!;
const debounced = { timeout: 3000 };

describe("UsersListScreen — what is shown", () => {
  it("shows each account with the safe facts, in the order the server gave", async () => {
    renderScreen();
    const t = await table();

    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Name", "Username", "Role", "Joined", "Actions"]);

    const rows = within(t).getAllByRole("row").slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .slice(0, 3)
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ["Admin Me", "admin_me", "Admin"],
      ["Person 1", "person_1", "Writer"],
      ["Person 2", "person_2", "Learner"],
      // An account that has set neither is a dash, not a blank.
      ["—", "—", "Developer"],
    ]);
  });

  it("shows when each account was created, as a real <time> with the exact instant", async () => {
    renderScreen();
    const times = within(await table()).getAllByText(/2026/);
    expect(times.length).toBeGreaterThan(0);
    const first = times[0]!.closest("time")!;
    expect(first).toHaveAttribute("datetime", "2026-03-01T12:00:00.000100Z");
    expect(first).toHaveAttribute("title");
  });

  it("gives every other account a Change role button named for the person, and your own row says so instead", async () => {
    renderScreen();
    await table();

    expect(
      screen.getByRole("button", { name: "Change role for Person 1" }),
    ).toBeVisible();
    // No name, no username: a neutral phrase, never an empty accessible name.
    expect(
      screen.getByRole("button", { name: "Change role for this person" }),
    ).toBeVisible();
    const mine = await rowOf("Admin Me");
    expect(within(mine).getByText("That's you")).toBeVisible();
    expect(within(mine).queryByRole("button")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Change role for Admin Me/ }),
    ).toBeNull();
  });

  it("says when a change takes effect and that your own role is not yours to change", async () => {
    renderScreen();
    await table();
    expect(
      screen.getByText(
        "A role change takes effect on that person's next request. You can't change your own role.",
      ),
    ).toBeVisible();
  });

  it("offers no selection and no sorting: the order is newest account first, and no role edit can change it", async () => {
    renderScreen();
    const t = await table();
    expect(within(t).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(t).queryAllByRole("button", { name: /sort/i })).toHaveLength(
      0,
    );
  });

  it("asks the users endpoint for the first page at the page size, and for nothing else", async () => {
    const { listRequests } = renderScreen();
    await table();
    expect(listRequests).toEqual([`/users?limit=${USER_LIST_PAGE_SIZE}`]);
  });

  it("reads the search and the cursor from the address", async () => {
    navigation.reset("search=ana&cursor=c1", USERS_PATH);
    const { listRequests } = renderScreen({
      pages: { [pageKey("ana", "c1")]: userPage([userRow(5)]) },
    });
    await table();
    expect(listRequests).toEqual([
      `/users?search=ana&cursor=c1&limit=${USER_LIST_PAGE_SIZE}`,
    ]);
  });
});

describe("UsersListScreen — searching", () => {
  it("searches as the person types, replacing the address rather than stacking history", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderScreen({
      pages: {
        [pageKey()]: userPage([meRow(), userRow(1)]),
        [pageKey("ana")]: userPage([userRow(7, { displayName: "Ana Lopez" })]),
      },
    });
    await table();

    await user.type(
      screen.getByRole("searchbox", { name: "Search users" }),
      "ana",
    );

    await waitFor(
      () =>
        expect(navigation.replace).toHaveBeenCalledWith(
          `${USERS_PATH}?search=ana`,
          expect.anything(),
        ),
      debounced,
    );
    expect(navigation.push).not.toHaveBeenCalled();
    expect(await screen.findByText("Ana Lopez")).toBeVisible();
    expect(listRequests.at(-1)).toBe(
      `/users?search=ana&limit=${USER_LIST_PAGE_SIZE}`,
    );
  });

  it("starts again at the first page when the search changes", async () => {
    const user = userEvent.setup();
    navigation.reset("search=an&cursor=old", USERS_PATH);
    renderScreen({
      pages: {
        [pageKey("an", "old")]: userPage([userRow(1)]),
        [pageKey("ana")]: userPage([userRow(2, { displayName: "Ana" })]),
      },
    });
    await table();

    await user.type(
      screen.getByRole("searchbox", { name: "Search users" }),
      "a",
    );

    // A cursor only means something under the search that produced it.
    await waitFor(
      () =>
        expect(navigation.replace).toHaveBeenCalledWith(
          `${USERS_PATH}?search=ana`,
          expect.anything(),
        ),
      debounced,
    );
  });

  it("says no one matches, names what was searched for, and offers a way out", async () => {
    const user = userEvent.setup();
    navigation.reset("search=zzz", USERS_PATH);
    renderScreen({
      pages: {
        [pageKey("zzz")]: userPage([]),
        [pageKey()]: userPage([meRow(), userRow(1)]),
      },
    });

    expect(await screen.findByText("No one matches “zzz”")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    // Clearing is a refinement, like typing: it replaces the address instead of
    // adding a history entry — and it is the bare path, with no dangling `?`.
    await waitFor(
      () =>
        expect(navigation.replace).toHaveBeenCalledWith(
          USERS_PATH,
          expect.anything(),
        ),
      debounced,
    );
    expect(navigation.push).not.toHaveBeenCalled();
    expect(await screen.findByText("Person 1")).toBeVisible();
  });

  it("is never a blank panel when there are no accounts at all", async () => {
    renderScreen({ pages: { [pageKey()]: userPage([]) } });
    expect(await screen.findByText("No accounts yet")).toBeVisible();
  });
});

describe("UsersListScreen — paging", () => {
  const PAGES = {
    [pageKey()]: userPage([meRow(), userRow(1)], {
      nextCursor: "after-1",
    }),
    [pageKey("", "after-1")]: userPage([userRow(2), userRow(3)], {
      nextCursor: "after-2",
      hasPreviousPage: true,
      previousCursor: null,
    }),
    [pageKey("", "after-2")]: userPage([userRow(4)], {
      hasPreviousPage: true,
      previousCursor: "after-1",
    }),
  };

  it("goes to the next page with the server's cursor, and back with the one it gave", async () => {
    const user = userEvent.setup();
    renderScreen({ pages: PAGES });
    await table();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      `${USERS_PATH}?cursor=after-1`,
      expect.anything(),
    );
    expect(await screen.findByText("Person 3")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      `${USERS_PATH}?cursor=after-2`,
      expect.anything(),
    );
    expect(await screen.findByText("Person 4")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      `${USERS_PATH}?cursor=after-1`,
      expect.anything(),
    );
  });

  it("goes back to the first page with no cursor at all", async () => {
    const user = userEvent.setup();
    navigation.reset("cursor=after-1", USERS_PATH);
    renderScreen({ pages: PAGES });
    await screen.findByText("Person 3");

    await user.click(screen.getByRole("button", { name: "Previous page" }));

    expect(navigation.push).toHaveBeenLastCalledWith(
      USERS_PATH,
      expect.anything(),
    );
  });

  it("shows no pagination when everything fits on one page", async () => {
    renderScreen();
    await table();
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
  });

  it("keeps the search while paging", async () => {
    const user = userEvent.setup();
    navigation.reset("search=an", USERS_PATH);
    renderScreen({
      pages: {
        [pageKey("an")]: userPage([userRow(1)], { nextCursor: "c" }),
        [pageKey("an", "c")]: userPage([userRow(2)], {
          hasPreviousPage: true,
        }),
      },
    });
    await table();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(navigation.push).toHaveBeenLastCalledWith(
      `${USERS_PATH}?search=an&cursor=c`,
      expect.anything(),
    );
  });
});

describe("UsersListScreen — who may change a role (from the server's permissions)", () => {
  it("shows an Admin the buttons", async () => {
    renderScreen({ role: "admin" });
    await table();
    expect(
      screen.getAllByRole("button", { name: /^Change role for / }).length,
    ).toBeGreaterThan(0);
  });

  // The page and the endpoint both refuse a writer; if their permissions ever
  // lacked `edit`, this screen still would not draw what it cannot do.
  it.each(["writer", "developer"] as const)(
    "offers %s no Change role button, and no actions column at all",
    async (role) => {
      renderScreen({ role });
      const t = await table();
      expect(screen.queryByRole("button", { name: /Change role/ })).toBeNull();
      expect(within(t).queryByText("That's you")).toBeNull();
      expect(
        within(t)
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Name", "Username", "Role", "Joined"]);
    },
  );

  it("takes the buttons away when the role is revoked mid-session", async () => {
    const { setRole } = renderScreen({ role: "admin" });
    await screen.findByRole("button", { name: "Change role for Person 1" });

    setRole("writer");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Change role/ })).toBeNull(),
    );
  });

  it("shows someone the server refuses the access-denied panel, not an empty list", async () => {
    renderScreen({
      role: "writer",
      failList: () => new AdminApiError("FORBIDDEN", 403),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("No accounts yet")).toBeNull();
  });
});

describe("UsersListScreen — states", () => {
  it("shows a labelled skeleton, then the table", async () => {
    renderScreen();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the users");
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderScreen({
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
    const { redirect } = renderScreen({
      failList: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderScreen({
      failList: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await table();

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["users"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByText("Person 1")).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderScreen({
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
    // Privileged rows must not linger beside the denial.
    expect(screen.queryByText("Person 1")).toBeNull();
  });

  it("answers a cursor the server no longer understands in its own words, with no retry that could not help", async () => {
    navigation.reset("cursor=tampered", USERS_PATH);
    renderScreen({
      failList: () =>
        new AdminApiError("VALIDATION_FAILED", 422, undefined, {
          serverMessage:
            "That page link is not valid. Go back to the first page.",
        }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That page link is not valid. Go back to the first page.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("UsersListScreen — changing a role", () => {
  async function openDialog(
    user: ReturnType<typeof userEvent.setup>,
    name = "Person 1",
  ) {
    await user.click(
      await screen.findByRole("button", { name: `Change role for ${name}` }),
    );
    return screen.findByRole("dialog", { name: "Change role" });
  }
  const submit = (dialog: HTMLElement) =>
    within(dialog).findByRole("button", { name: /^(Change role|Changing…)$/ });

  async function choose(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    option: string,
  ) {
    await user.click(
      within(dialog).getByRole("combobox", { name: /New role/ }),
    );
    await user.click(await screen.findByRole("option", { name: option }));
  }

  describe("the dialog", () => {
    it("says who it is for, what they are now, and which account it is — and sends nothing yet", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();
      const dialog = await openDialog(user);

      expect(
        within(dialog).getByText("Person 1 is currently Writer."),
      ).toBeVisible();
      expect(
        within(dialog).getByText(userRow(1).id, { exact: false }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("combobox", { name: /New role/ }),
      ).toHaveTextContent("Writer");
      expect(commands).toEqual([]);
    });

    it("cannot be confirmed until a different role is chosen", async () => {
      const user = userEvent.setup();
      renderScreen();
      const dialog = await openDialog(user);

      expect(await submit(dialog)).toBeDisabled();
      expect(
        within(dialog).getByText("Choose the role Person 1 should have."),
      ).toBeVisible();

      await choose(user, dialog, "Developer");
      expect(await submit(dialog)).toBeEnabled();

      // Back to what they have: nothing to change again.
      await choose(user, dialog, "Writer");
      expect(await submit(dialog)).toBeDisabled();
    });

    it("offers all five roles, in order, by their everyday names", async () => {
      const user = userEvent.setup();
      renderScreen();
      const dialog = await openDialog(user);

      await user.click(
        within(dialog).getByRole("combobox", { name: /New role/ }),
      );
      expect(
        (await screen.findAllByRole("option")).map(
          (option) => option.textContent,
        ),
      ).toEqual(["Learner", "Beta tester", "Writer", "Developer", "Admin"]);
    });

    it("writes out what a promotion gives, with no warning", async () => {
      const user = userEvent.setup();
      renderScreen();
      const dialog = await openDialog(user);

      await choose(user, dialog, "Admin");

      expect(
        within(dialog).getByText(/Full access to the Admin console/),
      ).toBeVisible();
      expect(
        within(dialog).getByText("Person 1 will be able to:"),
      ).toBeVisible();
      expect(
        within(dialog).getByText(
          "See every account and change other people's roles",
        ),
      ).toBeVisible();
      expect(
        within(dialog).queryByText(/will no longer be able to/),
      ).toBeNull();
    });

    it("warns, in words, about what a demotion takes away", async () => {
      const user = userEvent.setup();
      renderScreen({
        pages: {
          [pageKey()]: userPage([
            meRow(),
            userRow(1, { role: "admin", displayName: "Boss One" }),
          ]),
        },
      });
      const dialog = await openDialog(user, "Boss One");

      await choose(user, dialog, "Learner");

      const warning = within(dialog).getByText(
        "Boss One will no longer be able to:",
      );
      expect(warning.closest(".MuiAlert-root")).toHaveClass(
        "MuiAlert-colorWarning",
      );
      for (const taken of [
        "Open the Admin console",
        "Publish curriculum, and manage levels, groups, imports and official decks",
        "See every account and change other people's roles",
      ]) {
        expect(within(dialog).getByText(taken)).toBeVisible();
      }
      expect(
        within(dialog).getByText(
          /Admin → Learner\. Takes effect on their next request/,
        ),
      ).toBeVisible();
    });

    it("never promises a Clerk, email or progress change — it says progress is untouched", async () => {
      const user = userEvent.setup();
      renderScreen();
      const dialog = await openDialog(user);
      await choose(user, dialog, "Beta tester");
      expect(
        within(dialog).getByText(/Their progress and settings are not touched/),
      ).toBeVisible();
    });

    it("closes with Cancel, changing nothing — and a reopened dialog starts as the person is", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();
      let dialog = await openDialog(user);
      await choose(user, dialog, "Admin");

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toEqual([]);

      dialog = await openDialog(user);
      expect(
        within(dialog).getByRole("combobox", { name: /New role/ }),
      ).toHaveTextContent("Writer");
    });

    it.each(DISMISSALS)(
      "closes by %s when nothing is in flight",
      async (_how, dismiss) => {
        const user = userEvent.setup();
        const { commands } = renderScreen();
        await openDialog(user);

        dismiss();

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(commands).toEqual([]);
      },
    );
  });

  describe("sending it", () => {
    it("sends exactly the role, the version token on the row, and a fresh UUID — no actor, no target, no Clerk id — to that account's role endpoint", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();
      const dialog = await openDialog(user);

      await choose(user, dialog, "Developer");
      await user.click(await submit(dialog));

      await waitFor(() => expect(commands).toHaveLength(1));
      expect(commands[0]).toEqual({
        path: `/users/${userRow(1).id}/role`,
        method: "PATCH",
        userId: userRow(1).id,
        body: {
          role: "developer",
          expectedUpdatedAt: userRow(1).updatedAt,
          idempotencyKey: expect.stringMatching(UUID),
        },
      });
      expect(Object.keys(commands[0]!.body).sort()).toEqual([
        "expectedUpdatedAt",
        "idempotencyKey",
        "role",
      ]);
    });

    it("sends the reason, trimmed, when one was given", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();
      const dialog = await openDialog(user);

      await choose(user, dialog, "Developer");
      await user.type(
        within(dialog).getByLabelText(/Reason/),
        "  Needs the logs for the launch  ",
      );
      await user.click(await submit(dialog));

      await waitFor(() => expect(commands).toHaveLength(1));
      expect(commands[0]!.body.reason).toBe("Needs the logs for the launch");
    });

    it("sends no reason at all when it was left blank", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();
      const dialog = await openDialog(user);

      await choose(user, dialog, "Developer");
      await user.type(within(dialog).getByLabelText(/Reason/), "   ");
      await user.click(await submit(dialog));

      await waitFor(() => expect(commands).toHaveLength(1));
      expect(commands[0]!.body).not.toHaveProperty("reason");
    });

    it("refuses a reason over the limit, in the dialog, and sends nothing", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();
      const dialog = await openDialog(user);

      await choose(user, dialog, "Developer");
      await user.click(within(dialog).getByLabelText(/Reason/));
      await user.paste("x".repeat(USER_ROLE_REASON_MAX + 1));
      await user.click(await submit(dialog));

      expect(
        await within(dialog).findByText(
          `Keep the reason to ${USER_ROLE_REASON_MAX} characters or fewer.`,
        ),
      ).toBeVisible();
      expect(commands).toEqual([]);
    });

    it("closes, says what happened, and shows the new role — re-reading the list and the permissions it caches", async () => {
      const user = userEvent.setup();
      const { listRequests, invalidate } = renderScreen();
      const dialog = await openDialog(user);
      const before = listRequests.length;

      await choose(user, dialog, "Developer");
      await user.click(await submit(dialog));

      expect(
        await screen.findByText("Person 1 is now Developer."),
      ).toBeVisible();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      // The list was marked stale and read again: the row shows the new role.
      await waitFor(() => expect(listRequests.length).toBeGreaterThan(before));
      const row = await rowOf("Person 1");
      expect(within(row).getByText("Developer")).toBeVisible();
      expect(within(row).queryByText("Writer")).toBeNull();
      // Permissions the screens cached are refreshed too — never trusted as authority.
      const keys = invalidate.mock.calls.map(
        (call) => (call[0] as { queryKey: string[] }).queryKey,
      );
      expect(keys).toContainEqual(["users"]);
      expect(keys).toContainEqual(["auth", "getPermissions"]);
    });

    it("uses the next version token for the next change to the same person", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen();

      let dialog = await openDialog(user);
      await choose(user, dialog, "Developer");
      await user.click(await submit(dialog));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      // The row now carries the token the first change returned.
      await waitFor(async () =>
        expect(
          within(await rowOf("Person 1")).getByText("Developer"),
        ).toBeVisible(),
      );

      dialog = await openDialog(user);
      await choose(user, dialog, "Learner");
      await user.click(await submit(dialog));

      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]!.body.expectedUpdatedAt).not.toBe(
        commands[0]!.body.expectedUpdatedAt,
      );
      expect(commands[1]!.body.expectedUpdatedAt).toBe(
        "2026-03-03T10:00:00.000001Z",
      );
      expect(commands[1]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });
  });

  describe("when the server says no", () => {
    async function refused(
      error: Error,
      user: ReturnType<typeof userEvent.setup>,
    ) {
      const view = renderScreen({
        answer: async () => {
          throw error;
        },
      });
      const dialog = await openDialog(user);
      await choose(user, dialog, "Developer");
      await user.click(await submit(dialog));
      return { ...view, dialog };
    }

    it("explains a stale view in the server's words, and offers Close only — then re-reads the list", async () => {
      const user = userEvent.setup();
      const { dialog, listRequests } = await refused(
        new AdminApiError("CONFLICT", 409, undefined, {
          serverMessage:
            "This account changed after you opened the list. Reload to see its current role, then try again.",
        }),
        user,
      );

      expect(
        await within(dialog).findByText(
          /This account changed after you opened the list/,
        ),
      ).toBeVisible();
      expect(
        within(dialog).queryByRole("button", {
          name: /^(Change role|Cancel)$/,
        }),
      ).toBeNull();
      const before = listRequests.length;

      await user.click(within(dialog).getByRole("button", { name: "Close" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(listRequests.length).toBeGreaterThan(before));
    });

    it("explains that no Admin may be left without one, with Close only", async () => {
      const user = userEvent.setup();
      const { dialog } = await refused(
        new AdminApiError("CONFLICT", 409, undefined, {
          serverMessage:
            "That would leave Polyglot without an Admin. Make someone else an Admin first.",
        }),
        user,
      );
      expect(await within(dialog).findByText(/without an Admin/)).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toBeVisible();
    });

    it("treats a person who is gone like a stale view: Close only, then a fresh list", async () => {
      const user = userEvent.setup();
      const { dialog, listRequests } = await refused(
        new AdminApiError("NOT_FOUND", 404, undefined, {
          serverMessage: "That user could not be found.",
        }),
        user,
      );
      expect(
        await within(dialog).findByText("That user could not be found."),
      ).toBeVisible();
      const before = listRequests.length;
      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(listRequests.length).toBeGreaterThan(before));
    });

    it("keeps the dialog open and editable for a refusal a different choice can fix", async () => {
      const user = userEvent.setup();
      const { dialog } = await refused(
        new AdminApiError("VALIDATION_FAILED", 422, undefined, {
          serverMessage: "That person already has that role.",
        }),
        user,
      );

      expect(
        await within(dialog).findByText("That person already has that role."),
      ).toBeVisible();
      // Still the form: the person can pick something else and go again.
      expect(await submit(dialog)).toBeEnabled();
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("combobox", { name: /New role/ }),
      ).toHaveTextContent("Developer");
    });

    it("offers only Close, as a warning, when the Admin is no longer allowed to change roles", async () => {
      const user = userEvent.setup();
      const { dialog } = await refused(
        new AdminApiError("FORBIDDEN", 403),
        user,
      );

      expect(
        await within(dialog).findByText(
          "You don't have access to this part of the admin console.",
        ),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toBeVisible();
      expect(
        within(dialog).queryByRole("button", {
          name: /^(Change role|Cancel)$/,
        }),
      ).toBeNull();
    });

    it("tells a rate-limited Admin how long to wait, and lets them try again", async () => {
      const user = userEvent.setup();
      const { dialog } = await refused(
        new AdminApiError("RATE_LIMITED", 429, undefined, {
          serverMessage: "Please slow down and try again in 9s.",
          retryAfterSeconds: 9,
        }),
        user,
      );
      expect(
        await within(dialog).findByText(
          "Please slow down and try again in 9s.",
        ),
      ).toBeVisible();
      expect(await submit(dialog)).toBeEnabled();
    });

    it("never shows a server fault's own text", async () => {
      const user = userEvent.setup();
      const { dialog } = await refused(
        new AdminApiError("INTERNAL_ERROR", 500, undefined, {
          serverMessage: "deadlock detected on users_clerk_user_id_key",
        }),
        user,
      );
      await within(dialog).findByText(/Something went wrong on our side/);
      expect(dialog).not.toHaveTextContent("users_clerk_user_id_key");
    });

    it("retries an unchanged request under the same key — and a changed one under a new key", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const { commands } = renderScreen({
        answer: async (command) => {
          attempts += 1;
          // The first two answers never arrive.
          if (attempts <= 2) throw new AdminApiError("NETWORK_ERROR", 0);
          return {
            userId: command.userId,
            role: command.body.role as "developer",
            updatedAt: "2026-03-03T10:00:00.000001Z",
          };
        },
      });
      const dialog = await openDialog(user);
      await choose(user, dialog, "Developer");

      await user.click(await submit(dialog));
      await within(dialog).findByText(/Couldn't reach the server/);
      // The same request again: the retry of one that may have got through.
      await user.click(await submit(dialog));
      await waitFor(() => expect(commands).toHaveLength(2));
      await within(dialog).findByText(/Couldn't reach the server/);
      // A different role is a different request.
      await choose(user, dialog, "Admin");
      await user.click(await submit(dialog));
      await waitFor(() => expect(commands).toHaveLength(3));

      expect(commands[1]!.body.idempotencyKey).toBe(
        commands[0]!.body.idempotencyKey,
      );
      expect(commands[2]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });
  });

  describe("while the request is in flight", () => {
    function slow() {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      return {
        release: () => release(),
        answer: async (command: {
          userId: string;
          body: Record<string, unknown>;
        }) => {
          await gate;
          return {
            userId: command.userId,
            role: command.body.role as "developer",
            updatedAt: "2026-03-03T10:00:00.000001Z",
          };
        },
      };
    }

    it("shows 'Changing…', disables both buttons, and refuses a second press", async () => {
      const user = userEvent.setup();
      const { release, answer } = slow();
      const { commands } = renderScreen({ answer });
      const dialog = await openDialog(user);
      await choose(user, dialog, "Developer");

      await user.click(await submit(dialog));

      const busy = await within(dialog).findByRole("button", {
        name: "Changing…",
      });
      expect(busy).toBeDisabled();
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toBeDisabled();
      expect(commands).toHaveLength(1);

      release();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toHaveLength(1);
    });

    it.each(DISMISSALS)("cannot be dismissed by %s", async (_how, dismiss) => {
      const user = userEvent.setup();
      const { release, answer } = slow();
      renderScreen({ answer });
      const dialog = await openDialog(user);
      await choose(user, dialog, "Developer");
      await user.click(await submit(dialog));
      await within(dialog).findByRole("button", { name: "Changing…" });

      dismiss();
      expect(screen.getByRole("dialog")).toBeVisible();

      release();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });

  it("starts a different person's dialog fresh — their own role, nothing typed", async () => {
    const user = userEvent.setup();
    renderScreen();

    let dialog = await openDialog(user, "Person 1");
    await choose(user, dialog, "Admin");
    await user.type(within(dialog).getByLabelText(/Reason/), "half typed");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    dialog = await openDialog(user, "Person 2");
    expect(
      within(dialog).getByRole("combobox", { name: /New role/ }),
    ).toHaveTextContent("Learner");
    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue("");
  });
});
