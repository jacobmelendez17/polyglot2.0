import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../admin-api-error";
import { DISMISSALS } from "../test-support/dialog-dismissals";
import { navigation } from "../test-support/next-navigation";
import type { LevelFields } from "./level-edit-model";
import { LevelEditScreen } from "./level-edit-screen";
import { renderWithLevelsApi } from "./levels-test-harness";

vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVEL_ID = "level-3";

beforeEach(() => {
  navigation.reset("", "/admin/curriculum/levels/level-3");
});

const BASICS: LevelFields = {
  name: "Basics",
  cefrLevel: "A1",
  status: "draft",
};
const COUNTS = { vocabularyItems: 45, grammarItems: 12, vocabularyGroups: 4 };

function renderEdit({
  fields = BASICS,
  ...script
}: { fields?: LevelFields } & Parameters<typeof renderWithLevelsApi>[1] = {}) {
  return renderWithLevelsApi(
    () => (
      <LevelEditScreen
        levelId={LEVEL_ID}
        levelNumber={3}
        fields={fields}
        counts={COUNTS}
      />
    ),
    script,
  );
}

const nameField = () => screen.findByLabelText("Name");
const save = () => screen.getByRole("button", { name: "Save" });

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  field: RegExp,
  option: string,
) {
  await user.click(await screen.findByRole("combobox", { name: field }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("LevelEditScreen — who may edit (from the server's permissions)", () => {
  it("shows an Admin the form, filled in with what the level has", async () => {
    renderEdit({ role: "admin" });

    expect(await nameField()).toHaveValue("Basics");
    expect(
      screen.getByRole("combobox", { name: /CEFR band/ }),
    ).toHaveTextContent("A1");
    expect(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent(
      "Draft",
    );
    expect(
      screen.getByText(
        "Contains 45 vocabulary items across 4 groups, and 12 grammar items. A level can hold any number of either — publishing it is your call.",
      ),
    ).toBeVisible();
  });

  it("shows a loading state first, labelled", async () => {
    renderEdit({ role: "admin" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the properties of this level",
    );
    await nameField();
  });

  // Spec 26 §6: "level/group structural mutations" are Admin-only.
  it("shows a writer the same facts, read-only, with no way to save", async () => {
    renderEdit({ role: "writer" });

    expect(await screen.findByText("Basics")).toBeVisible();
    expect(screen.getByText("A1")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.getByText("An Admin edits level properties.")).toBeVisible();
    expect(screen.getByText(/Contains 45 vocabulary items/)).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("shows 'Not set' in the closed field for a level with no band, not a blank box", async () => {
    renderEdit({
      role: "admin",
      fields: { name: "Basics", cefrLevel: null, status: "draft" },
    });
    expect(
      await screen.findByRole("combobox", { name: /CEFR band/ }),
    ).toHaveTextContent("Not set");
  });

  it("shows 'Not set' and a dash for a level with no band and no name", async () => {
    renderEdit({
      role: "writer",
      fields: { name: null, cefrLevel: null, status: "published" },
    });
    expect(await screen.findByText("Not set")).toBeVisible();
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.getByText("Published")).toBeVisible();
  });

  it("turns the form read-only when the role is revoked mid-session", async () => {
    const { setRole } = renderEdit({ role: "admin" });
    await nameField();

    setRole("writer");
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.getByText("An Admin edits level properties.")).toBeVisible();
  });
});

describe("LevelEditScreen — saving", () => {
  it("cannot be saved until something changes", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    await nameField();
    expect(save()).toBeDisabled();

    await user.type(await nameField(), "!");
    expect(save()).toBeEnabled();
    await user.keyboard("{Backspace}");
    expect(save()).toBeDisabled();
    expect(commands).toEqual([]);
  });

  it("sends only the field that changed, as a PATCH to this level, with a fresh UUID — and no actor", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    await user.clear(name);
    await user.type(name, "Colors");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({
      path: `/levels/${LEVEL_ID}`,
      method: "PATCH",
      body: { name: "Colors", idempotencyKey: expect.stringMatching(UUID) },
    });
    // Not the CEFR band, not the status: someone else may have changed those.
    expect(Object.keys(commands[0]!.body).sort()).toEqual([
      "idempotencyKey",
      "name",
    ]);
  });

  it("trims the name, and a blank one clears it (null), as the form it replaces did", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    await user.clear(name);
    await user.type(name, "   ");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body.name).toBeNull();
  });

  it("sets a CEFR band, and clears one with 'Not set'", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    await nameField();

    await choose(user, /CEFR band/, "B2");
    await user.click(save());
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({ cefrLevel: "B2" });
    expect(commands[0]!.body).not.toHaveProperty("name");

    // The select's empty option reads "Not set" on screen; React Admin names
    // it "Clear value" for assistive technology, which is what choosing it does.
    await choose(user, /CEFR band/, "Clear value");
    await user.click(save());
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]!.body.cefrLevel).toBeNull();
  });

  it("sends everything that changed in one request", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    await user.clear(name);
    await user.type(name, "Renamed");
    await choose(user, /CEFR band/, "C1");
    await choose(user, /Status/, "Pending");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({
      name: "Renamed",
      cefrLevel: "C1",
      status: "pending",
    });
  });

  it("says it saved, re-renders the server's heading, marks the list stale, and is unchanged again", async () => {
    const user = userEvent.setup();
    const { invalidate } = renderEdit();
    await user.type(await nameField(), "!");

    await user.click(save());

    expect(await screen.findByText("Saved")).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
    expect(
      invalidate.mock.calls.map(
        (call) => (call[0] as { queryKey: string[] }).queryKey[0],
      ),
    ).toContain("levels");
    expect(save()).toBeDisabled();
    // The form now holds what was saved.
    expect(await nameField()).toHaveValue("Basics!");
  });

  it("stops saying 'Saved' as soon as there is something new to save", async () => {
    const user = userEvent.setup();
    renderEdit();
    await user.type(await nameField(), "!");
    await user.click(save());
    await screen.findByText("Saved");

    await user.type(await nameField(), "?");

    await waitFor(() => expect(screen.queryByText("Saved")).toBeNull());
  });

  it("makes no request for a status change that learners cannot see", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    await nameField();

    await choose(user, /Status/, "Pending");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    // No confirmation was needed: draft → pending changes nothing for them.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(commands[0]!.body.status).toBe("pending");
  });

  describe("when the server says no", () => {
    it("shows its reason in the form, and keeps what was typed", async () => {
      const user = userEvent.setup();
      renderEdit({
        answer: async () => {
          throw new AdminApiError("NOT_FOUND", 404, undefined, {
            serverMessage: "That level could not be found.",
          });
        },
      });
      await user.type(await nameField(), "!");

      await user.click(save());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That level could not be found.",
      );
      expect(await nameField()).toHaveValue("Basics!");
      expect(save()).toBeEnabled();
      expect(screen.queryByText("Saved")).toBeNull();
      expect(navigation.refresh).not.toHaveBeenCalled();
    });

    it("retries an identical failed save under the same key, and a changed one under a new key", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const { commands } = renderEdit({
        answer: async () => {
          attempts += 1;
          if (attempts <= 2) throw new AdminApiError("NETWORK_ERROR", 0);
          return { levelId: LEVEL_ID };
        },
      });
      await user.type(await nameField(), "!");

      await user.click(save());
      await screen.findByText(/Couldn't reach the server/);
      await user.click(save());
      await waitFor(() => expect(commands).toHaveLength(2));
      await screen.findByText(/Couldn't reach the server/);
      await user.type(await nameField(), "?");
      await user.click(save());
      await waitFor(() => expect(commands).toHaveLength(3));

      expect(commands[1]!.body.idempotencyKey).toBe(
        commands[0]!.body.idempotencyKey,
      );
      expect(commands[2]!.body.idempotencyKey).not.toBe(
        commands[0]!.body.idempotencyKey,
      );
    });

    it("tells a rate-limited Admin how long to wait", async () => {
      const user = userEvent.setup();
      renderEdit({
        answer: async () => {
          throw new AdminApiError("RATE_LIMITED", 429, undefined, {
            serverMessage: "Please slow down and try again in 9s.",
            retryAfterSeconds: 9,
          });
        },
      });
      await user.type(await nameField(), "!");
      await user.click(save());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Please slow down and try again in 9s.",
      );
    });

    it("never shows a server fault's own text", async () => {
      const user = userEvent.setup();
      renderEdit({
        answer: async () => {
          throw new AdminApiError("INTERNAL_ERROR", 500, undefined, {
            serverMessage: "deadlock detected on levels",
          });
        },
      });
      await user.type(await nameField(), "!");
      await user.click(save());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/Something went wrong on our side/);
      expect(alert).not.toHaveTextContent("deadlock");
    });

    it("explains a refusal for lack of access as that, not as a fault", async () => {
      const user = userEvent.setup();
      renderEdit({
        answer: async () => {
          throw new AdminApiError("FORBIDDEN", 403);
        },
      });
      await user.type(await nameField(), "!");
      await user.click(save());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "You don't have access to this part of the admin console.",
      );
    });
  });
});

describe("LevelEditScreen — a change that decides what learners can reach asks first", () => {
  async function pickStatus(
    user: ReturnType<typeof userEvent.setup>,
    status: string,
  ) {
    await nameField();
    await choose(user, /Status/, status);
    await user.click(save());
    return screen.findByRole("dialog");
  }

  it("asks before publishing, says what learners get, and sends nothing yet", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });

    const dialog = await pickStatus(user, "Published");

    expect(
      within(dialog).getByRole("heading", { name: "Publish Level 3?" }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Learners will be able to use this level/),
    ).toBeVisible();
    expect(within(dialog).getByText("Status: Draft → Published")).toBeVisible();
    expect(commands).toEqual([]);
  });

  it("sends the change only once it is confirmed, then closes and says it saved", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });
    const dialog = await pickStatus(user, "Published");

    await user.click(
      within(dialog).getByRole("button", { name: "Publish level" }),
    );

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({
      path: `/levels/${LEVEL_ID}`,
      method: "PATCH",
      body: { status: "published" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("changes nothing when cancelled, and keeps the choice so it can be reconsidered", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });
    const dialog = await pickStatus(user, "Published");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toEqual([]);
    expect(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent(
      "Published",
    );
    expect(save()).toBeEnabled();
  });

  it("asks before taking a published level off-line, and says nothing is lost", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({
      role: "admin",
      fields: { ...BASICS, status: "published" },
    });

    const dialog = await pickStatus(user, "Archived");

    expect(
      within(dialog).getByRole("heading", {
        name: "Hide Level 3 from learners?",
      }),
    ).toBeVisible();
    expect(within(dialog).getByText(/Their progress is kept/)).toBeVisible();
    expect(
      within(dialog).getByText("Status: Published → Archived"),
    ).toBeVisible();
    expect(commands).toEqual([]);

    await user.click(
      within(dialog).getByRole("button", { name: "Hide level" }),
    );
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body.status).toBe("archived");
  });

  it("sends a name change that rides along with the status in the same, one request, after confirming", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });
    const name = await nameField();
    await user.clear(name);
    await user.type(name, "Colors");
    await choose(user, /Status/, "Published");
    await user.click(save());
    const dialog = await screen.findByRole("dialog");
    expect(commands).toEqual([]);

    await user.click(
      within(dialog).getByRole("button", { name: "Publish level" }),
    );

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({
      name: "Colors",
      status: "published",
    });
  });

  describe("when the server says no", () => {
    it("reports it in the dialog, and offers a retry under the same key", async () => {
      const user = userEvent.setup();
      let attempts = 0;
      const { commands } = renderEdit({
        role: "admin",
        answer: async () => {
          attempts += 1;
          if (attempts === 1) throw new AdminApiError("NETWORK_ERROR", 0);
          return { levelId: LEVEL_ID };
        },
      });
      const dialog = await pickStatus(user, "Published");
      await user.click(
        within(dialog).getByRole("button", { name: "Publish level" }),
      );

      expect(
        await within(dialog).findByText(/Couldn't reach the server/),
      ).toBeVisible();
      // The failure is in the dialog that caused it, not also behind it.
      // `hidden`: everything behind an open dialog is aria-hidden, which would
      // otherwise hide exactly the duplicate this is looking for.
      expect(screen.queryAllByRole("alert", { hidden: true })).toHaveLength(1);
      await user.click(
        within(dialog).getByRole("button", { name: "Try again" }),
      );

      await waitFor(() => expect(commands).toHaveLength(2));
      expect(commands[1]!.body.idempotencyKey).toBe(
        commands[0]!.body.idempotencyKey,
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it("offers only Close when the person may no longer change levels", async () => {
      const user = userEvent.setup();
      renderEdit({
        role: "admin",
        answer: async () => {
          throw new AdminApiError("FORBIDDEN", 403);
        },
      });
      const dialog = await pickStatus(user, "Published");
      await user.click(
        within(dialog).getByRole("button", { name: "Publish level" }),
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
          name: /Publish level|Try again|Cancel/,
        }),
      ).toBeNull();
    });

    it("forgets the failure when the dialog is closed", async () => {
      const user = userEvent.setup();
      renderEdit({
        role: "admin",
        answer: async () => {
          throw new AdminApiError("NETWORK_ERROR", 0);
        },
      });
      const dialog = await pickStatus(user, "Published");
      await user.click(
        within(dialog).getByRole("button", { name: "Publish level" }),
      );
      await within(dialog).findByText(/Couldn't reach the server/);

      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.queryByRole("alert")).toBeNull();
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
          return { levelId: LEVEL_ID };
        },
      };
    }

    it("shows 'Saving…', disables both buttons, and sends once", async () => {
      const user = userEvent.setup();
      const { release, answer } = slow();
      const { commands } = renderEdit({ role: "admin", answer });
      const dialog = await pickStatus(user, "Published");
      await user.click(
        within(dialog).getByRole("button", { name: "Publish level" }),
      );

      const busy = await within(dialog).findByRole("button", {
        name: "Saving…",
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
      renderEdit({ role: "admin", answer });
      const dialog = await pickStatus(user, "Published");
      await user.click(
        within(dialog).getByRole("button", { name: "Publish level" }),
      );
      await within(dialog).findByRole("button", { name: "Saving…" });

      dismiss();
      expect(screen.getByRole("dialog")).toBeVisible();

      release();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });

  it.each(DISMISSALS)(
    "closes by %s when nothing is in flight",
    async (_how, dismiss) => {
      const user = userEvent.setup();
      const { commands } = renderEdit({ role: "admin" });
      await pickStatus(user, "Published");

      dismiss();

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toEqual([]);
    },
  );
});
