import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NameField } from "./name-field";
import { updateNameAction } from "@/app/(app)/settings/account/actions";

vi.mock("@/app/(app)/settings/account/actions", () => ({
  updateNameAction: vi.fn(),
}));

const mockUpdateNameAction = vi.mocked(updateNameAction);

beforeEach(() => {
  mockUpdateNameAction.mockReset();
});

describe("NameField", () => {
  it("shows Add with a placeholder when no name exists yet", () => {
    render(<NameField initialName={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("shows the current name with an Edit action when one exists", () => {
    render(<NameField initialName="Jacob Melendez" />);

    expect(screen.getByText("Jacob Melendez")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("saves a new name and shows Saved on success", async () => {
    mockUpdateNameAction.mockResolvedValueOnce({ ok: true, data: { displayName: "New Name" } });
    const user = userEvent.setup();
    render(<NameField initialName="Old Name" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(mockUpdateNameAction).toHaveBeenCalledWith({ displayName: "New Name" });
    // Returns to the display state showing the server-confirmed value.
    expect(screen.getByText("New Name")).toBeInTheDocument();
  });

  it("shows the server error and keeps editing open on failure, without pretending the change saved", async () => {
    mockUpdateNameAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "That name isn't valid." },
    });
    const user = userEvent.setup();
    render(<NameField initialName="Old Name" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That name isn't valid.")).toBeInTheDocument();
    // Still in the editing form — the failed draft was never presented as saved.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("Cancel discards the draft and returns to the last saved value", async () => {
    const user = userEvent.setup();
    render(<NameField initialName="Old Name" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Discarded Draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Old Name")).toBeInTheDocument();
    expect(mockUpdateNameAction).not.toHaveBeenCalled();
  });
});
