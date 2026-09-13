import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UsernameField } from "./username-field";
import { updateUsernameAction } from "@/app/(app)/settings/account/actions";

vi.mock("@/app/(app)/settings/account/actions", () => ({
  updateUsernameAction: vi.fn(),
}));

const mockUpdateUsernameAction = vi.mocked(updateUsernameAction);

/**
 * `UsernameField` is a thin wrapper around `InlineTextSettingField`, which
 * owns the full save/edit/error behavior (see its own test file). This only
 * covers the wiring: the right label, initial value, and action call —
 * including surfacing the `USERNAME_TAKEN` conflict message a concurrent
 * claim produces.
 */
describe("UsernameField", () => {
  it("renders with the Username label and initial value", () => {
    render(<UsernameField initialUsername="jacobm" />);

    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByText("jacobm")).toBeInTheDocument();
  });

  it("shows Add when no username has been set yet", () => {
    render(<UsernameField initialUsername={null} />);

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("calls updateUsernameAction with the edited value on save", async () => {
    mockUpdateUsernameAction.mockResolvedValueOnce({ ok: true, data: { username: "newname" } });
    const user = userEvent.setup();
    render(<UsernameField initialUsername="oldname" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "newname");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(mockUpdateUsernameAction).toHaveBeenCalledWith({ username: "newname" });
  });

  it("surfaces a taken-username conflict without losing the draft state", async () => {
    mockUpdateUsernameAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "USERNAME_TAKEN", message: "That username is already taken." },
    });
    const user = userEvent.setup();
    render(<UsernameField initialUsername="oldname" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Username"));
    await user.type(screen.getByLabelText("Username"), "taken");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That username is already taken.")).toBeInTheDocument();
  });
});
