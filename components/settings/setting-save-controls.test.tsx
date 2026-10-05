import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingSaveControls } from "./setting-save-controls";

function renderControls(
  props: Partial<React.ComponentProps<typeof SettingSaveControls>> = {},
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <SettingSaveControls
      isDirty={false}
      state="idle"
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSave, onCancel };
}

describe("SettingSaveControls", () => {
  it("always renders Save and Cancel, disabled while nothing has changed", async () => {
    const user = userEvent.setup();
    const { onSave, onCancel } = renderControls();

    const save = screen.getByRole("button", { name: "Save" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(save).toBeDisabled();
    expect(cancel).toBeDisabled();

    await user.click(save);
    await user.click(cancel);
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("enables both buttons once there is a pending change", async () => {
    const user = userEvent.setup();
    const { onSave, onCancel } = renderControls({ isDirty: true });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while saving and keeps the Save label unchanged", () => {
    renderControls({ isDirty: true, state: "saving" });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("shows Saved with the buttons disabled again after a successful save", () => {
    renderControls({ isDirty: false, state: "saved" });

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows the error and leaves the buttons enabled so the learner can retry or back out", () => {
    renderControls({
      isDirty: true,
      state: "error",
      errorMessage: "Nope.",
    });

    expect(screen.getByText("Nope.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
});
