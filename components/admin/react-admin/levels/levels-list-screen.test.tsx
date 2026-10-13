import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEVEL_LIST_MAX } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { DISMISSALS } from "../test-support/dialog-dismissals";
import { navigation } from "../test-support/next-navigation";
import { LevelsListScreen } from "./levels-list-screen";
import {
  ONE_LANGUAGE,
  TWO_LANGUAGES,
  levelList,
  levelRow,
  renderWithLevelsApi,
} from "./levels-test-harness";

// `vi.mock` is hoisted above the imports, so the factory loads the navigation
// stand-in itself; it resolves to the same instance the test imports above.
vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const LEVELS_PATH = "/admin/curriculum/levels";

beforeEach(() => {
  navigation.reset("language=lang-es", LEVELS_PATH);
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Options = Parameters<typeof renderWithLevelsApi>[1] & {
  languages?: { id: string; name: string }[];
};

function renderScreen({ languages = ONE_LANGUAGE, ...script }: Options = {}) {
  return renderWithLevelsApi(
    () => <LevelsListScreen languages={languages} />,
    script,
  );
}

const table = () => screen.findByRole("table", { name: "Levels" });

/** Two levels with every field the table shows. */
const PRESENT = {
  "lang-es": levelList([
    levelRow(1, {
      name: "Basics",
      status: "published",
      cefrLevel: "A1",
      vocabularyItems: 45,
      grammarItems: 12,
      vocabularyGroups: 4,
    }),
    levelRow(2),
  ]),
};

describe("LevelsListScreen — what is shown (parity with the page it replaces)", () => {
  it("shows every fact the old cards showed, in a table", async () => {
    renderScreen({ levels: PRESENT });
    const t = await table();

    const headers = within(t)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Level",
      "Status",
      "CEFR band",
      "Vocabulary",
      "Grammar",
      "Groups",
    ]);

    const [basics, bare] = within(t).getAllByRole("row").slice(1);
    // The card's title: "Level N — name".
    expect(
      within(basics!).getByRole("link", { name: "Level 1 — Basics" }),
    ).toBeVisible();
    expect(within(basics!).getByText("Published")).toBeVisible();
    expect(within(basics!).getByText("A1")).toBeVisible();
    const cells = within(basics!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(3)).toEqual(["45", "12", "4"]);

    // A level with no name is just "Level N".
    expect(within(bare!).getByRole("link", { name: "Level 2" })).toBeVisible();
    expect(within(bare!).getByText("Draft")).toBeVisible();
  });

  it("shows a level that holds nothing as zeros — a level may be empty, and that is not an error", async () => {
    renderScreen({ levels: PRESENT });
    const [, bare] = within(await table())
      .getAllByRole("row")
      .slice(1);
    const cells = within(bare!)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(3)).toEqual(["0", "0", "0"]);
  });

  it("shows no CEFR band as a dash, not as a blank", async () => {
    renderScreen({ levels: PRESENT });
    const [, bare] = within(await table())
      .getAllByRole("row")
      .slice(1);
    expect(within(bare!).getAllByRole("cell")[2]).toHaveTextContent("—");
  });

  it("links each level to its detail page, where the specialist board lives", async () => {
    renderScreen({ levels: PRESENT });
    const t = await table();
    expect(
      within(t).getByRole("link", { name: "Level 1 — Basics" }),
    ).toHaveAttribute("href", "/admin/curriculum/levels/level-1");
    expect(within(t).getByRole("link", { name: "Level 2" })).toHaveAttribute(
      "href",
      "/admin/curriculum/levels/level-2",
    );
  });

  it("lists the levels in the order the server gave, which is by level number", async () => {
    renderScreen({
      levels: {
        "lang-es": levelList([levelRow(1), levelRow(2), levelRow(10)]),
      },
    });
    const t = await table();
    expect(
      within(t)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Level 1", "Level 2", "Level 10"]);
  });

  it("offers no selection and no sorting: bulk actions and re-ordering are not part of this screen", async () => {
    renderScreen({ levels: PRESENT });
    const t = await table();
    expect(within(t).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(t).queryAllByRole("button", { name: /sort/i })).toHaveLength(
      0,
    );
  });

  it("asks the levels endpoint for the URL's language, and for nothing else", async () => {
    const { listRequests } = renderScreen({ levels: PRESENT });
    await table();
    expect(listRequests).toEqual(["/levels?language=lang-es"]);
  });
});

describe("LevelsListScreen — who may add a level (from the server's permissions)", () => {
  it("shows an Admin the Add level button", async () => {
    renderScreen({ levels: PRESENT, role: "admin" });
    await table();
    expect(screen.getByRole("button", { name: "Add level" })).toBeVisible();
  });

  // Spec 26 §6: "level/group structural mutations" are Admin-only.
  it("shows a writer every level, no way to add one, and a note saying why", async () => {
    renderScreen({ levels: PRESENT, role: "writer" });
    const t = await table();

    expect(within(t).getByText("Level 1 — Basics")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add level" })).toBeNull();
    expect(
      screen.getByText(
        "You can see every level. An Admin adds and edits them.",
      ),
    ).toBeVisible();
  });

  it("takes the button away when the role is revoked mid-session", async () => {
    const { setRole } = renderScreen({ levels: PRESENT, role: "admin" });
    await screen.findByRole("button", { name: "Add level" });

    setRole("writer");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add level" })).toBeNull(),
    );
    // They can still read the list.
    expect(screen.getByText("Level 1 — Basics")).toBeVisible();
  });

  it("shows someone who may not read levels at all the access-denied panel, not an empty list", async () => {
    renderScreen({
      levels: PRESENT,
      role: "developer",
      failList: () => new AdminApiError("FORBIDDEN", 403),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this part of the admin console.",
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("No levels yet for this language")).toBeNull();
  });
});

describe("LevelsListScreen — states", () => {
  it("shows a labelled skeleton, then the table", async () => {
    renderScreen({ levels: PRESENT });
    expect(screen.getByRole("status")).toHaveTextContent("Loading the levels");
    await table();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("invites an Admin to add the first level when there are none", async () => {
    renderScreen({ levels: { "lang-es": levelList([]) }, role: "admin" });
    expect(
      await screen.findByText("No levels yet for this language"),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Add the first level, then build out its curriculum from the Curriculum page.",
      ),
    ).toBeVisible();
    // Two ways in: the toolbar's, and the empty state's own.
    expect(screen.getAllByRole("button", { name: "Add level" })).toHaveLength(
      2,
    );
  });

  it("tells a writer whose job it is, with no button to press", async () => {
    renderScreen({ levels: { "lang-es": levelList([]) }, role: "writer" });
    expect(
      await screen.findByText("No levels yet for this language"),
    ).toBeVisible();
    expect(screen.getAllByText("An Admin adds levels.").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("button", { name: "Add level" })).toBeNull();
  });

  it("says when the list was cut short, instead of quietly dropping levels", async () => {
    renderScreen({ levels: { "lang-es": levelList([levelRow(1)], true) } });
    expect(
      await screen.findByText(`Showing the first ${LEVEL_LIST_MAX} levels.`),
    ).toBeVisible();
  });

  it("does not say so when nothing was cut", async () => {
    renderScreen({ levels: PRESENT });
    await table();
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it("offers a retry for a server failure, and recovers", async () => {
    const user = userEvent.setup();
    let failing = true;
    renderScreen({
      levels: PRESENT,
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
      levels: PRESENT,
      failList: () => new AdminApiError("UNAUTHENTICATED", 401),
    });
    expect(await screen.findByText(/Your session has ended\./)).toBeVisible();
    await waitFor(() => expect(redirect).toHaveBeenCalledOnce());
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the rows, with a warning, when a refresh fails transiently", async () => {
    let failing = false;
    const { queryClient } = renderScreen({
      levels: PRESENT,
      failList: () => (failing ? new AdminApiError("NETWORK_ERROR", 0) : null),
    });
    await table();

    failing = true;
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["levels"] });
    });

    expect(await screen.findByText(/Couldn't reach the server/)).toBeVisible();
    expect(screen.getByText("Level 1 — Basics")).toBeVisible();
  });

  it("replaces stale rows with access-denied when access is revoked mid-session", async () => {
    let revoked = false;
    renderScreen({
      levels: PRESENT,
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
    expect(screen.queryByText("Level 1 — Basics")).toBeNull();
  });
});

describe("LevelsListScreen — the language", () => {
  it("is not offered when there is only one language to choose", async () => {
    renderScreen({ levels: PRESENT });
    await table();
    expect(screen.queryByRole("combobox", { name: /Language/ })).toBeNull();
  });

  it("switches language, and shows that language's levels", async () => {
    const user = userEvent.setup();
    const { listRequests } = renderScreen({
      languages: TWO_LANGUAGES,
      levels: {
        ...PRESENT,
        "lang-fr": levelList([levelRow(7, { name: "Les couleurs" })]),
      },
    });
    await table();

    await user.click(screen.getByRole("combobox", { name: /Language/ }));
    await user.click(await screen.findByRole("option", { name: "French" }));

    await waitFor(
      () =>
        expect(navigation.push).toHaveBeenCalledWith(
          `${LEVELS_PATH}?language=lang-fr`,
          expect.anything(),
        ),
      { timeout: 3000 },
    );
    expect(
      await screen.findByRole("link", { name: "Level 7 — Les couleurs" }),
    ).toBeVisible();
    expect(screen.queryByText("Level 1 — Basics")).toBeNull();
    expect(listRequests.at(-1)).toBe("/levels?language=lang-fr");
  });

  it("falls back to the first language for an unknown one in the URL", async () => {
    navigation.reset("language=not-a-language", LEVELS_PATH);
    const { listRequests } = renderScreen({ levels: PRESENT });
    await table();
    expect(listRequests[0]).toBe("/levels?language=lang-es");
  });
});

describe("LevelsListScreen — adding a level", () => {
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Add level" }));
    return screen.findByRole("dialog", { name: "Add a level" });
  }
  const numberField = (dialog: HTMLElement) =>
    within(dialog).getByLabelText(/Level number/);
  const nameField = (dialog: HTMLElement) =>
    within(dialog).getByLabelText("Name (optional)");
  const submit = (dialog: HTMLElement) =>
    within(dialog).findByRole("button", { name: /^(Add level|Adding…)$/ });

  async function fillAndSubmit(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    { number, name }: { number: string; name?: string },
  ) {
    await user.clear(numberField(dialog));
    await user.type(numberField(dialog), number);
    if (name !== undefined) {
      await user.clear(nameField(dialog));
      await user.type(nameField(dialog), name);
    }
    await user.click(await submit(dialog));
  }

  it("asks for a number and an optional name, and says what a new level is", async () => {
    const user = userEvent.setup();
    const { commands } = renderScreen({ levels: PRESENT });
    const dialog = await openDialog(user);

    expect(
      within(dialog).getByText(
        "New levels start as drafts until their curriculum is built out and published.",
      ),
    ).toBeVisible();
    expect(numberField(dialog)).toBeVisible();
    expect(nameField(dialog)).toBeVisible();
    // Opening it sent nothing, and the button waits for a number.
    expect(commands).toEqual([]);
    expect(await submit(dialog)).toBeDisabled();
  });

  it("sends the language from the URL, the number, a trimmed name, and a fresh UUID — and no actor", async () => {
    const user = userEvent.setup();
    const { commands } = renderScreen({ levels: PRESENT });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, { number: "4", name: "  Colors  " });

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({
      path: "/levels",
      method: "POST",
      body: {
        languageId: "lang-es",
        levelNumber: 4,
        name: "Colors",
        idempotencyKey: expect.stringMatching(UUID),
      },
    });
    expect(Object.keys(commands[0]!.body).sort()).toEqual([
      "idempotencyKey",
      "languageId",
      "levelNumber",
      "name",
    ]);
  });

  it("leaves the name out when none was typed", async () => {
    const user = userEvent.setup();
    const { commands } = renderScreen({ levels: PRESENT });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, { number: "9", name: "   " });

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).not.toHaveProperty("name");
    expect(commands[0]!.body.levelNumber).toBe(9);
  });

  it("uses the language the list is showing", async () => {
    const user = userEvent.setup();
    navigation.reset("language=lang-fr", LEVELS_PATH);
    const { commands } = renderScreen({
      languages: TWO_LANGUAGES,
      levels: { "lang-es": levelList([]), "lang-fr": levelList([levelRow(1)]) },
    });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, { number: "2" });

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body.languageId).toBe("lang-fr");
  });

  it("closes, goes to the new level's page, and marks the levels list stale", async () => {
    const user = userEvent.setup();
    const { invalidate } = renderScreen({
      levels: PRESENT,
      answer: async () => ({ levelId: "the-new-level" }),
    });
    const dialog = await openDialog(user);

    await fillAndSubmit(user, dialog, { number: "3" });

    await waitFor(() =>
      expect(navigation.push.mock.calls.at(-1)?.[0]).toBe(
        "/admin/curriculum/levels/the-new-level",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      invalidate.mock.calls.map(
        (call) => (call[0] as { queryKey: string[] }).queryKey[0],
      ),
    ).toContain("levels");
  });

  describe("validation — the rules of the dialog it replaces", () => {
    it.each([
      ["no number", "", "Required"],
      ["zero", "0", "Must be at least 1"],
      ["a negative number", "-3", "Must be at least 1"],
      ["a fraction", "1.5", "Enter a whole number"],
    ])("refuses %s, and sends nothing", async (_name, typed, message) => {
      const user = userEvent.setup();
      const { commands } = renderScreen({ levels: PRESENT });
      const dialog = await openDialog(user);

      if (typed !== "") await user.type(numberField(dialog), typed);
      else await user.type(nameField(dialog), "A name alone is not enough");
      await user.click(await submit(dialog));

      expect(await within(dialog).findByText(message)).toBeVisible();
      expect(commands).toEqual([]);
    });
  });

  describe("when the server says no", () => {
    it("shows a taken number in plain words, and keeps what was typed", async () => {
      const user = userEvent.setup();
      renderScreen({
        levels: PRESENT,
        answer: async () => {
          throw new AdminApiError("VALIDATION_FAILED", 422, undefined, {
            serverMessage: "Level 4 already exists for this language.",
          });
        },
      });
      const dialog = await openDialog(user);

      await fillAndSubmit(user, dialog, { number: "4", name: "Colors" });

      expect(
        await within(dialog).findByText(
          "Level 4 already exists for this language.",
        ),
      ).toBeVisible();
      // Still open, still filled in, and the person can fix it and go again.
      expect(numberField(dialog)).toHaveValue(4);
      expect(nameField(dialog)).toHaveValue("Colors");
      expect(await submit(dialog)).toBeEnabled();
      expect(navigation.push).not.toHaveBeenCalled();
    });

    it("retries an unchanged request under the same key — and a changed one under a new key", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const { commands } = renderScreen({
        levels: PRESENT,
        answer: async () => {
          attempts += 1;
          // The first two answers never arrive.
          if (attempts <= 2) throw new AdminApiError("NETWORK_ERROR", 0);
          return { levelId: "made" };
        },
      });
      const dialog = await openDialog(user);

      await fillAndSubmit(user, dialog, { number: "4" });
      await within(dialog).findByText(/Couldn't reach the server/);
      // The same request again: the retry of one that may have got through.
      await user.click(await submit(dialog));
      await waitFor(() => expect(commands).toHaveLength(2));
      await within(dialog).findByText(/Couldn't reach the server/);
      // A different number is a different request.
      await user.clear(numberField(dialog));
      await user.type(numberField(dialog), "5");
      await user.click(await submit(dialog));
      await waitFor(() => expect(commands).toHaveLength(3));

      expect(commands[1]!.body.idempotencyKey).toBe(
        commands[0]!.body.idempotencyKey,
      );
      expect(commands[2]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });

    it("sends the next level added under a new key, not the one that already succeeded", async () => {
      const user = userEvent.setup();
      const { commands } = renderScreen({ levels: PRESENT });

      let dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, { number: "4" });
      await waitFor(() => expect(commands).toHaveLength(1));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      // The same number again, from a fresh dialog.
      dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, { number: "4" });
      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });

    it("offers only Close when the person is no longer allowed to add levels", async () => {
      const user = userEvent.setup();
      renderScreen({
        levels: PRESENT,
        answer: async () => {
          throw new AdminApiError("FORBIDDEN", 403);
        },
      });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, { number: "4" });

      expect(
        await within(dialog).findByText(
          "You don't have access to this part of the admin console.",
        ),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toBeVisible();
      expect(
        within(dialog).queryByRole("button", { name: /^(Add level|Cancel)$/ }),
      ).toBeNull();
    });

    it("tells a rate-limited Admin how long to wait, and lets them try again", async () => {
      const user = userEvent.setup();
      renderScreen({
        levels: PRESENT,
        answer: async () => {
          throw new AdminApiError("RATE_LIMITED", 429, undefined, {
            serverMessage: "Please slow down and try again in 9s.",
            retryAfterSeconds: 9,
          });
        },
      });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, { number: "4" });

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
        levels: PRESENT,
        answer: async () => {
          throw new AdminApiError("INTERNAL_ERROR", 500, undefined, {
            serverMessage: "relation levels does not exist",
          });
        },
      });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, { number: "4" });

      await within(dialog).findByText(/Something went wrong on our side/);
      expect(dialog).not.toHaveTextContent("relation levels");
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
          return { levelId: "made" };
        },
      };
    }

    it("shows 'Adding…', disables both buttons, and refuses a second press", async () => {
      const user = userEvent.setup();
      const { release, answer } = slow();
      const { commands } = renderScreen({ levels: PRESENT, answer });
      const dialog = await openDialog(user);

      await fillAndSubmit(user, dialog, { number: "4" });

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
      renderScreen({ levels: PRESENT, answer });
      const dialog = await openDialog(user);
      await fillAndSubmit(user, dialog, { number: "4" });
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
      const { commands } = renderScreen({ levels: PRESENT });
      let dialog = await openDialog(user);
      await user.type(numberField(dialog), "8");

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toEqual([]);

      dialog = await openDialog(user);
      expect(numberField(dialog)).toHaveValue(null);
    });

    it.each(DISMISSALS)(
      "closes by %s when nothing is in flight",
      async (_how, dismiss) => {
        const user = userEvent.setup();
        const { commands } = renderScreen({ levels: PRESENT });
        await openDialog(user);

        dismiss();

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(commands).toEqual([]);
      },
    );
  });
});
