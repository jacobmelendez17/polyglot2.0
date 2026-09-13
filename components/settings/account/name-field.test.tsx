import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NameField } from "./name-field";
import { updateNameAction } from "@/app/(app)/settings/account/actions";

vi.mock("@/app/(app)/settings/account/actions", () => ({
  updateNameAction: vi.fn(),
}));

const mockUpdateNameAction = vi.mocked(updateNameAction);

/**
 * `NameField` is a thin wrapper around `InlineTextSettingField`, which owns
 * the full save/edit/error behavior (see its own test file). This only
 * covers the wiring: the right label, initial value, and action call.
 */
describe("NameField", () => {
  it("renders with the Name label and initial value", () => {
    render(<NameField initialName="Jacob Melendez" />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Jacob Melendez")).toBeInTheDocument();
  });

  it("calls updateNameAction with the edited value on save", async () => {
    mockUpdateNameAction.mockResolvedValueOnce({ ok: true, data: { displayName: "New Name" } });
    const user = userEvent.setup();
    render(<NameField initialName="Old Name" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(mockUpdateNameAction).toHaveBeenCalledWith({ displayName: "New Name" });
  });
});
