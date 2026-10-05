import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InlineToggleSettingField } from "./inline-toggle-setting-field";

describe("InlineToggleSettingField", () => {
  it("renders the label, description, and initial state", () => {
    render(
      <InlineToggleSettingField
        label="Show NSFW Content"
        description="Off by default."
        initialValue={false}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Show NSFW Content")).toBeInTheDocument();
    expect(screen.getByText("Off by default.")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
    // No pending change yet — Save/Cancel are always present (so the layout
    // never shifts) but disabled.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("flips locally without saving until Save is clicked", async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: true, value: true });
    const user = userEvent.setup();
    render(
      <InlineToggleSettingField
        label="Show NSFW Content"
        initialValue={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toBeChecked();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(true);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Cancel reverts the flip without ever calling onSave", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <InlineToggleSettingField
        label="Show NSFW Content"
        initialValue={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("keeps the switch on the drafted value and shows the error when the save fails", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Could not save setting." });
    const user = userEvent.setup();
    render(
      <InlineToggleSettingField
        label="Show NSFW Content"
        initialValue={false}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Could not save setting."),
    ).toBeInTheDocument();
    // A failed save never applied — the draft stays exactly as drafted, and
    // Save/Cancel stay available to retry or back out.
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
