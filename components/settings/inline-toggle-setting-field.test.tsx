import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InlineToggleSettingField } from "./inline-toggle-setting-field";

describe("InlineToggleSettingField", () => {
  it("renders the label, description, and initial state", () => {
    render(
      <InlineToggleSettingField label="Show NSFW Content" description="Off by default." initialValue={false} onSave={vi.fn()} />,
    );

    expect(screen.getByText("Show NSFW Content")).toBeInTheDocument();
    expect(screen.getByText("Off by default.")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("optimistically flips and shows Saved on success", async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: true, value: true });
    const user = userEvent.setup();
    render(<InlineToggleSettingField label="Show NSFW Content" initialValue={false} onSave={onSave} />);

    await user.click(screen.getByRole("switch"));

    expect(onSave).toHaveBeenCalledWith(true);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("reverts to the previous value and shows the error when the save fails", async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ ok: false, message: "Could not save setting." });
    const user = userEvent.setup();
    render(<InlineToggleSettingField label="Show NSFW Content" initialValue={false} onSave={onSave} />);

    await user.click(screen.getByRole("switch"));

    expect(await screen.findByText("Could not save setting.")).toBeInTheDocument();
    // Reverted — the failed toggle never looks successfully persisted.
    expect(screen.getByRole("switch")).not.toBeChecked();
  });
});
