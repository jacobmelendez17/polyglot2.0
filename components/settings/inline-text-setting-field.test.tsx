import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InlineTextSettingField } from "./inline-text-setting-field";

describe("InlineTextSettingField", () => {
  it("shows Add with a placeholder when no value exists yet", () => {
    render(
      <InlineTextSettingField
        label="Name"
        initialValue={null}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("shows the current value with an Edit action when one exists", () => {
    render(
      <InlineTextSettingField
        label="Name"
        initialValue="Jacob Melendez"
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Jacob Melendez")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("saves a new value and shows Saved on success", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, value: "New Name" });
    const user = userEvent.setup();
    render(
      <InlineTextSettingField
        label="Name"
        initialValue="Old Name"
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Name");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith("New Name");
    // Returns to the display state showing the server-confirmed value.
    expect(screen.getByText("New Name")).toBeInTheDocument();
  });

  it("shows the server error and keeps editing open on failure, without pretending the change saved", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "That value isn't valid." });
    const user = userEvent.setup();
    render(
      <InlineTextSettingField
        label="Name"
        initialValue="Old Name"
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("That value isn't valid."),
    ).toBeInTheDocument();
    // Still in the editing form — the failed draft was never presented as saved.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("Cancel discards the draft and returns to the last saved value", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <InlineTextSettingField
        label="Name"
        initialValue="Old Name"
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Discarded Draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Old Name")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
