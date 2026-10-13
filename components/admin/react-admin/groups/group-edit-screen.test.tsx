import { focusManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GROUP_NAME_MAX } from "@/domains/admin";

import { AdminApiError } from "../admin-api-error";
import { DISMISSALS } from "../test-support/dialog-dismissals";
import { navigation } from "../test-support/next-navigation";
import type { GroupFields } from "./group-edit-model";
import { GroupEditScreen } from "./group-edit-screen";
import { renderWithGroupsApi } from "./groups-test-harness";

vi.mock("next/navigation", async () =>
  (await import("../test-support/next-navigation")).nextNavigationMock(),
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUP_ID = "group-3";

beforeEach(() => {
  navigation.reset("", `/admin/curriculum/groups/${GROUP_ID}`);
});

const COLORS: GroupFields = { name: "Colors", status: "draft" };

function renderEdit({
  fields = COLORS,
  ...script
}: { fields?: GroupFields } & Parameters<typeof renderWithGroupsApi>[1] = {}) {
  return renderWithGroupsApi(
    () => <GroupEditScreen groupId={GROUP_ID} fields={fields} />,
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

describe("GroupEditScreen — who may edit (from the server's permissions)", () => {
  it("shows an Admin the form, filled in with what the group has", async () => {
    renderEdit({ role: "admin" });

    expect(await nameField()).toHaveValue("Colors");
    expect(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent(
      "Draft",
    );
  });

  it("has no position field: ordering is the reorder tool's, and a form that could type one could collide with its siblings", async () => {
    renderEdit({ role: "admin" });
    await nameField();
    expect(screen.queryByLabelText(/position|lesson|order|level/i)).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("shows a loading state first, labelled", async () => {
    renderEdit({ role: "admin" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the properties of this group",
    );
    await nameField();
  });

  // Spec 26 §6: "level/group structural mutations" are Admin-only.
  it("shows a writer the same facts, read-only, with no way to save", async () => {
    renderEdit({ role: "writer" });

    expect(await screen.findByText("Colors")).toBeVisible();
    expect(screen.getByText("Draft")).toBeVisible();
    expect(screen.getByText("An Admin edits group properties.")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("offers no form to anyone whose permissions do not include editing groups, whatever their role", async () => {
    // The page has already refused anyone who may not manage curriculum; this
    // is the screen's own rule: no `edit` on `groups`, no form.
    renderEdit({ role: "developer" });

    expect(
      await screen.findByText("An Admin edits group properties."),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
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
    expect(screen.getByText("An Admin edits group properties.")).toBeVisible();
  });
});

describe("GroupEditScreen — saving", () => {
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

  it("sends nothing for a change that trims away — the saved name is already that name", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    // Trailing spaces make the form dirty, so Save is offered ...
    await user.type(name, "   ");
    expect(save()).toBeEnabled();
    // ... but trimmed it is the same name: there is nothing to send, and a
    // request carrying nothing would only be refused.
    await user.click(save());

    // A real change afterwards. The only request that ever goes out is this
    // one — had the first press sent an empty one, it would be here too, first.
    await user.clear(name);
    await user.type(name, "Animals");
    await user.click(save());
    await screen.findByText("Saved");
    expect(commands).toHaveLength(1);
    expect(commands[0]!.body).toMatchObject({ name: "Animals" });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("sends only the field that changed, as a PATCH to this group, with a fresh UUID — and no actor, position or level", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    await user.clear(name);
    await user.type(name, "Animals");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toEqual({
      path: `/groups/${GROUP_ID}`,
      method: "PATCH",
      body: { name: "Animals", idempotencyKey: expect.stringMatching(UUID) },
    });
    // Not the status: someone else may have changed it.
    expect(Object.keys(commands[0]!.body).sort()).toEqual([
      "idempotencyKey",
      "name",
    ]);
  });

  it("trims the name", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    await user.clear(name);
    await user.type(name, "   Animals  ");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body.name).toBe("Animals");
  });

  it("sends a status change alone, without the name", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    await nameField();

    await choose(user, /Status/, "Pending");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({ status: "pending" });
    expect(commands[0]!.body).not.toHaveProperty("name");
  });

  it("sends everything that changed in one request", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    const name = await nameField();

    await user.clear(name);
    await user.type(name, "Renamed");
    await choose(user, /Status/, "Published");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({
      name: "Renamed",
      status: "published",
    });
  });

  it("saves a status that is not archiving directly, as the form it replaces did — no confirmation", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    await nameField();

    await choose(user, /Status/, "Published");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
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
    ).toContain("groups");
    expect(save()).toBeDisabled();
    // The form now holds what was saved — for this same group.
    expect(await nameField()).toHaveValue("Colors!");
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

  it("sends only what changed since the last save, not the whole group again", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit();
    await user.type(await nameField(), "!");
    await user.click(save());
    await screen.findByText("Saved");

    await choose(user, /Status/, "Pending");
    await user.click(save());

    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]!.body).toMatchObject({ status: "pending" });
    expect(commands[1]!.body).not.toHaveProperty("name");
    expect(commands[1]!.body.idempotencyKey).not.toBe(
      commands[0]!.body.idempotencyKey,
    );
  });

  describe("validation — the rules of the form it replaces", () => {
    it("refuses a name of only spaces, in the form, and sends nothing", async () => {
      const user = userEvent.setup();
      const { commands } = renderEdit();
      const name = await nameField();

      await user.clear(name);
      await user.type(name, "   ");
      await user.click(save());

      expect(
        await screen.findByText("Enter a name for this group."),
      ).toBeVisible();
      expect(commands).toEqual([]);
    });

    it("refuses a cleared name — a group always has one", async () => {
      const user = userEvent.setup();
      const { commands } = renderEdit();
      const name = await nameField();

      await user.clear(name);
      await user.click(save());

      expect(
        await screen.findByText("Enter a name for this group."),
      ).toBeVisible();
      expect(commands).toEqual([]);
    });

    it("refuses a name over the limit, and says the limit", async () => {
      const user = userEvent.setup();
      const { commands } = renderEdit();
      const name = await nameField();

      await user.clear(name);
      await user.click(name);
      await user.paste("x".repeat(GROUP_NAME_MAX + 1));
      await user.click(save());

      expect(
        await screen.findByText(
          `Keep the name to ${GROUP_NAME_MAX} characters or fewer.`,
        ),
      ).toBeVisible();
      expect(commands).toEqual([]);
    });
  });

  describe("when the server says no", () => {
    it("shows its reason in the form, and keeps what was typed", async () => {
      const user = userEvent.setup();
      renderEdit({
        answer: async () => {
          throw new AdminApiError("NOT_FOUND", 404, undefined, {
            serverMessage: "That group could not be found.",
          });
        },
      });
      await user.type(await nameField(), "!");

      await user.click(save());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "That group could not be found.",
      );
      expect(await nameField()).toHaveValue("Colors!");
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
          return { groupId: GROUP_ID };
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
            serverMessage: "deadlock detected on vocabulary_groups",
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

describe("GroupEditScreen — archiving asks first", () => {
  async function pickStatus(
    user: ReturnType<typeof userEvent.setup>,
    status: string,
  ) {
    await nameField();
    await choose(user, /Status/, status);
    await user.click(save());
    return screen.findByRole("dialog");
  }

  it("asks before archiving, names the group, says what it means, and sends nothing yet", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });

    const dialog = await pickStatus(user, "Archived");

    expect(
      within(dialog).getByRole("heading", { name: "Archive “Colors”?" }),
    ).toBeVisible();
    expect(within(dialog).getByText(/stay on record/)).toBeVisible();
    expect(
      within(dialog).getByText(/Existing vocabulary items keep their group/),
    ).toBeVisible();
    expect(within(dialog).getByText("Status: Draft → Archived")).toBeVisible();
    expect(commands).toEqual([]);
  });

  it("styles the confirmation as the warning it is", async () => {
    const user = userEvent.setup();
    renderEdit({ role: "admin" });
    const dialog = await pickStatus(user, "Archived");
    expect(within(dialog).getByRole("button", { name: "Archive" })).toHaveClass(
      "MuiButton-colorError",
    );
  });

  it("sends the change only once it is confirmed, then closes and says it saved", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });
    const dialog = await pickStatus(user, "Archived");

    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({
      path: `/groups/${GROUP_ID}`,
      method: "PATCH",
      body: { status: "archived" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Saved")).toBeVisible();
    expect(navigation.refresh).toHaveBeenCalledOnce();
    // The form holds what was saved — not what the group was before.
    expect(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent(
      "Archived",
    );
    expect(save()).toBeDisabled();
  });

  it("changes nothing when cancelled, and keeps the choice so it can be reconsidered", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });
    const dialog = await pickStatus(user, "Archived");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toEqual([]);
    expect(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent(
      "Archived",
    );
    expect(save()).toBeEnabled();
  });

  it("asks before archiving a published group too", async () => {
    const user = userEvent.setup();
    renderEdit({ role: "admin", fields: { ...COLORS, status: "published" } });

    const dialog = await pickStatus(user, "Archived");

    expect(
      within(dialog).getByText("Status: Published → Archived"),
    ).toBeVisible();
  });

  it("does not ask when un-archiving, or when an archived group is merely renamed", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({
      role: "admin",
      fields: { ...COLORS, status: "archived" },
    });
    await nameField();

    await choose(user, /Status/, "Draft");
    await user.click(save());
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();

    await choose(user, /Status/, "Archived");
    await user.type(await nameField(), "!");
    await user.click(save());
    await screen.findByRole("dialog");
  });

  it("names the group as it will be called after the save, when it is renamed in the same save", async () => {
    const user = userEvent.setup();
    const { commands } = renderEdit({ role: "admin" });
    const name = await nameField();
    await user.clear(name);
    await user.type(name, "Animals");
    await choose(user, /Status/, "Archived");
    await user.click(save());
    const dialog = await screen.findByRole("dialog");
    expect(commands).toEqual([]);
    expect(
      within(dialog).getByRole("heading", { name: "Archive “Animals”?" }),
    ).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]!.body).toMatchObject({
      name: "Animals",
      status: "archived",
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
          return { groupId: GROUP_ID };
        },
      });
      const dialog = await pickStatus(user, "Archived");
      await user.click(within(dialog).getByRole("button", { name: "Archive" }));

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

    it("offers only Close when the person may no longer change groups", async () => {
      const user = userEvent.setup();
      renderEdit({
        role: "admin",
        answer: async () => {
          throw new AdminApiError("FORBIDDEN", 403);
        },
      });
      const dialog = await pickStatus(user, "Archived");
      await user.click(within(dialog).getByRole("button", { name: "Archive" }));

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
          name: /Archive|Try again|Cancel/,
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
      const dialog = await pickStatus(user, "Archived");
      await user.click(within(dialog).getByRole("button", { name: "Archive" }));
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
          return { groupId: GROUP_ID };
        },
      };
    }

    it("shows 'Saving…', disables both buttons, and sends once", async () => {
      const user = userEvent.setup();
      const { release, answer } = slow();
      const { commands } = renderEdit({ role: "admin", answer });
      const dialog = await pickStatus(user, "Archived");
      await user.click(within(dialog).getByRole("button", { name: "Archive" }));

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
      const dialog = await pickStatus(user, "Archived");
      await user.click(within(dialog).getByRole("button", { name: "Archive" }));
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
      await pickStatus(user, "Archived");

      dismiss();

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(commands).toEqual([]);
    },
  );
});
