import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GROUP_LIST_MAX, GROUP_NAME_MAX } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { DISMISSALS } from "../test-support/dialog-dismissals";
import { navigation } from "../test-support/next-navigation";
import { GROUPS_PATH } from "./group-list-params";
import { GroupsListScreen } from "./groups-list-screen";
import {
  LEVELS_BY_LANGUAGE,
  ONE_LANGUAGE,
  TWO_LANGUAGES,
  groupList,
  groupRow,
  renderWithGroupsApi,
} from "./groups-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

beforeEach(() => {
  navigation.reset("language=lang-es&level=level-1", GROUPS_PATH);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_LEVELS_LANGUAGE = [{ id: "lang-empty", name: "Klingon" }];
const NO_LEVELS: never[] = [];

type Options = Parameters<typeof renderWithGroupsApi>[1] & {
  languages?: { id: string; name: string }[];
};

/**
 * What the server-rendered page does: it reads `?language=` from the URL and
 * hands the screen *that language's* levels. Re-evaluated on every render, so a
 * language switch (a navigation) reaches the screen with the new levels, as it
 * does in the app.
 */
function renderScreen({ languages = ONE_LANGUAGE, ...script }: Options = {}) {
  return renderWithGroupsApi(() => {
    const requested = new URLSearchParams(navigation.search).get("language");
    const language = languages.find((l) => l.id === requested) ?? languages[0]!;
    return (
      <GroupsListScreen
        languages={languages}
        levels={LEVELS_BY_LANGUAGE[language.id] ?? NO_LEVELS}
      />
    );
  }, script);
}

const table = () => screen.findByRole("table", { name: "Groups" });

/** Level 1's groups, with every field the table shows — and positions that are not 1, 2, 3. */
const PRESENT = {
  "level-1": groupList([
    groupRow(1, { name: "Mango", status: "published", position: 1 }),
    groupRow(2, { name: "Apple", status: "draft", position: 2 }),
    groupRow(3, { name: "Zebra", status: "archived", position: 5 }),
  ]),
  "level-2": groupList([
    groupRow(9, { id: "l2-g", levelId: "level-2", name: "Kiwi", position: 1 }),
  ]),
};

describe("GroupsListScreen — what is shown (parity with the page it replaces)", () => {
  it("shows what the reorder list showed — each group and its status — plus its lesson number, in a table", async () => {
    renderScreen({ groups: PRESENT });
    const t = await table();

    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Lesson", "Group", "Status"]);

    const rows = within(t).getAllByRole("row").slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole("cell")
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ["1", "Mango", "Published"],
      ["2", "Apple", "Draft"],
      ["5", "Zebra", "Archived"],
    ]);
  });

  it("lists the groups in the order the server gave — which is by position, never by name", async () => {
    renderScreen({ groups: PRESENT });
    const t = await table();
    expect(
      within(t)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Mango", "Apple", "Zebra"]);
  });

  it("shows each group's own position as its lesson number, and does not renumber a gap", async () => {
    renderScreen({ groups: PRESENT });
    const t = await table();
    const zebra = within(t).getByRole("link", { name: "Zebra" }).closest("tr")!;
    expect(within(zebra).getAllByRole("cell")[0]).toHaveTextContent("5");
  });

  it("links each group to its page", async () => {
    renderScreen({ groups: PRESENT });
    const t = await table();
    expect(within(t).getByRole("link", { name: "Mango" })).toHaveAttribute(
      "href",
      "/admin/curriculum/groups/group-1",
    );
    expect(within(t).getByRole("link", { name: "Zebra" })).toHaveAttribute(
      "href",
      "/admin/curriculum/groups/group-3",
    );
  });

  it("offers no selection and no sorting: the position is the order, and no list control may rewrite it", async () => {
    renderScreen({ groups: PRESENT });
    const t = await table();
    expect(within(t).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(t).queryAllByRole("button", { name: /sort/i })).toHaveLength(
      0,
    );
  });

  it("asks the groups endpoint for the URL's language and level, and for nothing else", async () => {
    const { listRequests } = renderScreen({ groups: PRESENT });
    await table();
    expect(listRequests).toEqual(["/groups?language=lang-es&level=level-1"]);
  });
});

describe("GroupsListScreen — who may add or reorder (from the server's permissions)", () => {
  it("shows an Admin the Add group button and the way into the reorder tool", async () => {
    renderScreen({ groups: PRESENT, role: "admin" });
    await table();
    expect(screen.getByRole("button", { name: "Add group" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reorder groups" })).toBeVisible();
  });

  it("links to the reorder tool for the same language and level the list is showing", async () => {
    renderScreen({ groups: PRESENT, role: "admin" });
    await table();
    expect(
      screen.getByRole("link", { name: "Reorder groups" }),
    ).toHaveAttribute(
      "href",
      `${GROUPS_PATH}?language=lang-es&level=level-1&mode=reorder`,
    );
  });

  it("carries the level the person switched to into the reorder link", async () => {
    navigation.reset("language=lang-es&level=level-2", GROUPS_PATH);
    renderScreen({
      groups: {
        ...PRESENT,
        "level-2": groupList([
          groupRow(1, { id: "a", levelId: "level-2" }),
          groupRow(2, { id: "b", levelId: "level-2" }),
        ]),
      },
    });
    await table();
    expect(
      screen.getByRole("link", { name: "Reorder groups" }),
    ).toHaveAttribute(
      "href",
      `${GROUPS_PATH}?language=lang-es&level=level-2&mode=reorder`,
    );
  });

  it("does not offer to reorder what has nothing to put in order", async () => {
    navigation.reset("language=lang-es&level=level-2", GROUPS_PATH);
    renderScreen({ groups: PRESENT });
    await table();
    expect(screen.queryByRole("link", { name: "Reorder groups" })).toBeNull();
    // Adding is still offered.
    expect(screen.getByRole("button", { name: "Add group" })).toBeVisible();
  });

  // Spec 26 §6: "level/group structural mutations" are Admin-only.
  it("shows a writer every group, no way to add or reorder one, and a note saying why", async () => {
    renderScreen({ groups: PRESENT, role: "writer" });
    const t = await table();

    expect(within(t).getByText("Mango")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reorder groups" })).toBeNull();
    expect(
      screen.getByText(
        "You can see every group. An Admin adds and edits them.",
      ),
    ).toBeVisible();
  });

  it("takes the buttons away when the role is revoked mid-session", async () => {
    const { setRole } = renderScreen({ groups: PRESENT, role: "admin" });
    await screen.findByRole("button", { name: "Add group" });

    setRole("writer");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add group" })).toBeNull(),
    );
    expect(screen.queryByRole("link", { name: "Reorder groups" })).toBeNull();
    // They can still read the list.
    expect(screen.getByText("Mango")).toBeVisible();
  });

  it("shows someone who may not read groups at all the access-denied panel, not an empty list", async () => {
    renderScreen({
      groups: PRESENT,
      role: "developer",
      failList: () => new AdminApiError("FORBIDDEN", 403),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/No vocabulary groups yet/)).toBeNull();
  });
});

describe("GroupsListScreen — states", () => {
  it("shows a labelled skeleton, then the table", async () => {
    renderScreen({ groups: PRESENT });
    expect(screen.getByRole("status")).toHaveTextContent("Loading the groups");
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("invites an Admin to add the first group to a level that has none", async () => {
    renderScreen({ groups: { "level-1": groupList([]) }, role: "admin" });
    expect(
      await screen.findByText("No vocabulary groups yet in Level 1"),
    ).toBeVisible();
    expect(
      screen.getByText(/Add the first group\. Each new group is added after/),
    ).toBeVisible();
    // Two ways in: the toolbar's, and the empty state's own.
    expect(screen.getAllByRole("button", { name: "Add group" })).toHaveLength(
      2,
    );
  });

  it("tells a writer whose job it is, with no button to press", async () => {
    renderScreen({ groups: { "level-1": groupList([]) }, role: "writer" });
    expect(
      await screen.findByText("No vocabulary groups yet in Level 1"),
    ).toBeVisible();
    expect(screen.getAllByText("An Admin adds groups.").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
  });

  it("says when the list was cut short, instead of quietly dropping groups", async () => {
    renderScreen({ groups: { "level-1": groupList([groupRow(1)], true) } });
    expect(
      await screen.findByText(`Showing the first ${GROUP_LIST_MAX} groups.`),
    ).toBeVisible();
  });

  it("does not say so when nothing was cut", async () => {
    renderScreen({ groups: PRESENT });
    await table();
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderScreen({
      groups: PRESENT,
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
      groups: PRESENT,
      failList: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderScreen({
      groups: PRESENT,
      failList: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await table();

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["groups"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByText("Mango")).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderScreen({
      groups: PRESENT,
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
    expect(screen.queryByText("Mango")).toBeNull();
  });
});

describe("GroupsListScreen — a language with no levels", () => {
  beforeEach(() => {
    navigation.reset("language=lang-empty", GROUPS_PATH);
  });

  it("says groups need a level, and points at where levels are made — without asking the API for any group", async () => {
    const { listRequests } = renderScreen({ languages: NO_LEVELS_LANGUAGE });

    expect(
      await screen.findByText("No levels yet for this language"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Groups belong to a level. Create a level first, then add groups to it.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Levels" })).toHaveAttribute(
      "href",
      "/admin/curriculum/levels?language=lang-empty",
    );
    // The endpoint would refuse a request that names no level, so none is made.
    expect(listRequests).toEqual([]);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers no Add group button and no level to choose, for anyone", async () => {
    renderScreen({ languages: NO_LEVELS_LANGUAGE, role: "admin" });
    await screen.findByText("No levels yet for this language");
    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reorder groups" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Level/ })).toBeNull();
  });

  it("still lets the person switch to a language that has groups", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderScreen({
      languages: [{ id: "lang-empty", name: "Klingon" }, ...ONE_LANGUAGE],
      groups: PRESENT,
    });
    await screen.findByText("No levels yet for this language");

    await user.click(screen.getByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: "Spanish" }));

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          `${GROUPS_PATH}?language=lang-es`,
          expect.anything(),
        ),
      { timeout: 3000 },
    );
    expect(await screen.findByRole("link", { name: "Mango" })).toBeVisible();
    expect(listRequests.at(-1)).toBe("/groups?language=lang-es&level=level-1");
  });
});

describe("GroupsListScreen — the language and the level", () => {
  it("does not offer a language when there is only one to choose", async () => {
    renderScreen({ groups: PRESENT });
    await table();
    expect(screen.queryByRole("combobox", { name: /Language/ })).toBeNull();
  });

  it("always shows which level it is showing — groups are never listed across levels", async () => {
    renderScreen({ groups: PRESENT });
    await table();
    expect(screen.getByRole("combobox", { name: /Level/ })).toHaveTextContent(
      "Level 1",
    );
  });

  it("offers each of the language's levels and no 'all levels'", async () => {
    const user = userEvent.setup();
    renderScreen({ groups: PRESENT });
    await table();

    await user.click(screen.getByRole("combobox", { name: /Level/ }));
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Level 1", "Level 2"]);
  });

  it("switches level, and shows that level's groups", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderScreen({ groups: PRESENT });
    await table();

    await user.click(screen.getByRole("combobox", { name: /Level/ }));
    await user.click(await screen.findByRole("option", { name: "Level 2" }));

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          `${GROUPS_PATH}?language=lang-es&level=level-2`,
          expect.anything(),
        ),
      { timeout: 3000 },
    );
    expect(await screen.findByRole("link", { name: "Kiwi" })).toBeVisible();
    // Only that level's groups: nothing from level 1 lingers.
    expect(screen.queryByText("Mango")).toBeNull();
    expect(listRequests.at(-1)).toBe("/groups?language=lang-es&level=level-2");
  });

  it("starts at the language's first level when the URL names none", async () => {
    navigation.reset("language=lang-es", GROUPS_PATH);
    const { listRequests } = renderScreen({ groups: PRESENT });
    await table();
    expect(listRequests).toEqual(["/groups?language=lang-es&level=level-1"]);
  });

  it.each([
    ["an unknown level", "language=lang-es&level=nope"],
    // A level of another language must never be sent: the endpoint would refuse it.
    ["a level of another language", "language=lang-es&level=level-7"],
  ])(
    "falls back to the first level for %s in the URL",
    async (_name, query) => {
      navigation.reset(query, GROUPS_PATH);
      const { listRequests } = renderScreen({ groups: PRESENT });
      await table();
      expect(listRequests).toEqual(["/groups?language=lang-es&level=level-1"]);
    },
  );

  it("falls back to the first language for an unknown one in the URL", async () => {
    navigation.reset("language=not-a-language&level=level-1", GROUPS_PATH);
    const { listRequests } = renderScreen({ groups: PRESENT });
    await table();
    expect(listRequests[0]).toBe("/groups?language=lang-es&level=level-1");
  });

  it("switches language, drops the old level, and shows the new language's first level", async () => {
    const user = userEvent.setup();
    // Material UI says so when a select holds a value that is not one of its
    // choices — which is what a level left over from the old language looks like.
    const logged = vi.spyOn(console, "warn");
    const { listRequests } = renderScreen({
      languages: TWO_LANGUAGES,
      groups: {
        ...PRESENT,
        "level-7": groupList([
          groupRow(1, { id: "fr-1", levelId: "level-7", name: "Les couleurs" }),
        ]),
      },
    });
    await table();

    await user.click(screen.getByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: "French" }));

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          // The level is not carried over: it belongs to the old language.
          `${GROUPS_PATH}?language=lang-fr`,
          expect.anything(),
        ),
      { timeout: 3000 },
    );
    expect(
      await screen.findByRole("link", { name: "Les couleurs" }),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: /Level/ })).toHaveTextContent(
      "Level 7",
    );
    expect(screen.queryByText("Mango")).toBeNull();
    expect(listRequests.at(-1)).toBe("/groups?language=lang-fr&level=level-7");
    expect(
      logged.mock.calls.some((call) =>
        String(call[0]).includes("out-of-range"),
      ),
    ).toBe(false);
    logged.mockRestore();
  });
});

describe("GroupsListScreen — adding a group", () => {
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Add group" }));
    return screen.findByRole("dialog", { name: "Add a vocabulary group" });
  }
  const nameField = (dialog: HTMLElement) =>
    within(dialog).getByLabelText("Name");
  const submit = (dialog: HTMLElement) =>
    within(dialog).findByRole("button", { name: /^(Add group|Adding…)$/ });

  async function fillAndSubmit(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    name: string,
  ) {
    await user.clear(nameField(dialog));
    await user.type(nameField(dialog), name);
    await user.click(await submit(dialog));
  }

  it("asks only for a name, and says where the group will go", async () => {
    const user = userEvent.setup();
    const { commands } = renderScreen({ groups: PRESENT });
    const dialog = await openDialog(user);

    expect(
      within(dialog).getByText(
        "New groups are added after the existing groups in Level 1.",
      ),
    ).toBeVisible();
    expect(nameField(dialog)).toBeVisible();
    // No level to pick (the filter is where a level is chosen) and no position to type.
    expect(within(dialog).queryByRole("combobox")).toBeNull();
    expect(within(dialog).queryByLabelText(/position/i)).toBeNull();
    // Opening it sent nothing, and the button waits for a name.
    expect(commands).toEqual([]);
    expect(await submit(dialog)).toBeDisabled();
  });

  it("sends the language and level from the URL, a trimmed name, and a fresh UUID — and no position, no actor", async () => {
    const user = userEvent.setup();
    const { commands } = renderScreen({ groups: PRESENT });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, "  Fruit  ");

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({
      path: "/groups",
      method: "POST",
      body: {
        languageId: "lang-es",
        levelId: "level-1",
        name: "Fruit",
        idempotencyKey: expect.stringMatching(UUID),
      },
    });
    expect(Object.keys(commands[0]!.body).sort()).toEqual([
      "idempotencyKey",
      "languageId",
      "levelId",
      "name",
    ]);
  });

  it("adds to the level the list is showing, not the first one — and says so", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-es&level=level-2", GROUPS_PATH);
    const { commands } = renderScreen({ groups: PRESENT });
    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText(
        "New groups are added after the existing groups in Level 2.",
      ),
    ).toBeVisible();

    await fillAndSubmit(user, dialog, "Fruit");

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({
      languageId: "lang-es",
      levelId: "level-2",
    });
  });

  it("follows the level when it is switched — the dialog never keeps the one it first saw", async () => {
    const user = userEvent.setup();
    const { commands } = renderScreen({ groups: PRESENT });
    await table();

    await user.click(screen.getByRole("combobox", { name: /Level/ }));
    await user.click(await screen.findByRole("option", { name: "Level 2" }));
    await screen.findByRole("link", { name: "Kiwi" });

    const dialog = await openDialog(user);
    await fillAndSubmit(user, dialog, "Fruit");

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body.levelId).toBe("level-2");
  });

  it("uses the language the list is showing", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-fr", GROUPS_PATH);
    const { commands } = renderScreen({
      languages: TWO_LANGUAGES,
      groups: {
        ...PRESENT,
        "level-7": groupList([groupRow(1, { levelId: "level-7" })]),
      },
    });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, "Les fruits");

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({
      languageId: "lang-fr",
      levelId: "level-7",
    });
  });

  it("closes, goes to the new group's page, and marks the groups list stale", async () => {
    const user = userEvent.setup();
    const { invalidate } = renderScreen({
      groups: PRESENT,
      answer: async () => ({ groupId: "the-new-group" }),
    });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, "Fruit");

    await waitFor(() =>
      expect(navigation.push.mock.calls.at(-1)?.[0]).toBe(
        "/admin/curriculum/groups/the-new-group",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      invalidate.mock.calls.map(
        (call) => (call[0] as { queryKey: string[] }).queryKey[0],
      ),
    ).toContain("groups");
  });

  describe("validation — the rules of the dialog it replaces", () => {
    it.each([
      ["only spaces", "   ", "Enter a name for this group."],
      [
        "a name over the limit",
        "x".repeat(GROUP_NAME_MAX + 1),
        `Keep the name to ${GROUP_NAME_MAX} characters or fewer.`,
      ],
    ])("refuses %s, and sends nothing", async (_name, typed, message) => {
      const user = userEvent.setup();
      const { commands } = renderScreen({ groups: PRESENT });
      const dialog = await openDialog(user);

      await user.click(nameField(dialog));
      await user.paste(typed);
      await user.click(await submit(dialog));

      expect(await within(dialog).findByText(message)).toBeVisible();
      expect(commands).toEqual([]);
    });
  });

  describe("when the server says no", () => {
    it("shows its reason in plain words, and keeps what was typed", async () => {
      const user = userEvent.setup();
      renderScreen({
        groups: PRESENT,
        answer: async () => {
          throw new AdminApiError("VALIDATION_FAILED", 422, undefined, {
            serverMessage:
              "That level doesn't belong to the selected language.",
          });
        },
      });
      const dialog = await openDialog(user);

      await fillAndSubmit(user, dialog, "Fruit");

      expect(
        await within(dialog).findByText(
          "That level doesn't belong to the selected language.",
        ),
      ).toBeVisible();
      // Still open, still filled in, and the person can fix it and go again.
      expect(nameField(dialog)).toHaveValue("Fruit");
      expect(await submit(dialog)).toBeEnabled();
      expect(navigation.push).not.toHaveBeenCalled();
    });

    it("retries an unchanged request under the same key — and a changed one under a new key", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const { commands } = renderScreen({
        groups: PRESENT,
        answer: async () => {
          attempts += 1;
          // The first two answers never arrive.
          if (attempts <= 2) throw new AdminApiError("NETWORK_ERROR", 0);
          return { groupId: "made" };
        },
      });
      const dialog = await openDialog(user);

      await fillAndSubmit(user, dialog, "Fruit");
      await within(dialog).findByText(/Couldn't reach the server/);
      // The same request again: the retry of one that may have got through.
      await user.click(await submit(dialog));
      await waitFor(() => expect(commands).toHaveLength(2));
      await within(dialog).findByText(/Couldn't reach the server/);
      // A different name is a different request.
      await user.type(nameField(dialog), "s");
      await user.click(await submit(dialog));
      await waitFor(() => expect(commands).toHaveLength(3));

      expect(commands[1]!.body.idempotencyKey).toBe(
        commands[0]!.body.idempotencyKey,
      );
      expect(commands[2]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });

    it("sends the next group added under a new key, not the one that already succeeded", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen({ groups: PRESENT });

      let dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, "Fruit");
      await waitFor(() => expect(commands).toHaveLength(1));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      // The same name again, from a fresh dialog.
      dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, "Fruit");
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });

    it("offers only Close when the person is no longer allowed to add groups", async () => {
      const user = userEvent.setup();
      renderScreen({
        groups: PRESENT,
        answer: async () => {
          throw new AdminApiError("FORBIDDEN", 403);
        },
      });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, "Fruit");

      expect(
        await within(dialog).findByText(
          "You don't have access to this part of the admin console.",
        ),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toBeVisible();
      expect(
        within(dialog).queryByRole("button", { name: /^(Add group|Cancel)$/ }),
      ).toBeNull();
    });

    it("tells a rate-limited Admin how long to wait, and lets them try again", async () => {
      const user = userEvent.setup();
      renderScreen({
        groups: PRESENT,
        answer: async () => {
          throw new AdminApiError("RATE_LIMITED", 429, undefined, {
            serverMessage: "Please slow down and try again in 9s.",
            retryAfterSeconds: 9,
          });
        },
      });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, "Fruit");

      expect(
        await within(dialog).findByText(
          "Please slow down and try again in 9s.",
        ),
      ).toBeVisible();
      expect(await submit(dialog)).toBeEnabled();
    });

    it("never shows a server fault's own text", async () => {
      const user = userEvent.setup();
      renderScreen({
        groups: PRESENT,
        answer: async () => {
          throw new AdminApiError("INTERNAL_ERROR", 500, undefined, {
            serverMessage:
              "duplicate key value violates vocabulary_groups_level_position",
          });
        },
      });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, "Fruit");

      await within(dialog).findByText(/Something went wrong on our side/);
      expect(dialog).not.toHaveTextContent("vocabulary_groups");
    });
  });

  describe("while the request is in flight", () => {
    function slow() {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      return {
        release: () => release(),
        answer: async () => {
          await gate;
          return { groupId: "made" };
        },
      };
    }

    it("shows 'Adding…', disables both buttons, and refuses a second press", async () => {
      const user = userEvent.setup();
      const { release, answer } = slow();
      const { commands } = renderScreen({ groups: PRESENT, answer });
      const dialog = await openDialog(user);

      await fillAndSubmit(user, dialog, "Fruit");

      const busy = await within(dialog).findByRole("button", {
        name: "Adding…",
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
      renderScreen({ groups: PRESENT, answer });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, "Fruit");
      await within(dialog).findByRole("button", { name: "Adding…" });

      dismiss();
      expect(screen.getByRole("dialog")).toBeVisible();

      release();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });

  describe("closing it", () => {
    it("changes nothing when cancelled, and a reopened dialog starts empty", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen({ groups: PRESENT });
      let dialog = await openDialog(user);
      await user.type(nameField(dialog), "Half-typed");

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toEqual([]);

      dialog = await openDialog(user);
      expect(nameField(dialog)).toHaveValue("");
    });

    it.each(DISMISSALS)(
      "closes by %s when nothing is in flight",
      async (_how, dismiss) => {
        const user = userEvent.setup();
        const { commands } = renderScreen({ groups: PRESENT });
        await openDialog(user);

        dismiss();

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(commands).toEqual([]);
      },
    );
  });
});
