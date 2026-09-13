import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TimezoneSelect } from "./timezone-select";
import { updateTimezoneAction } from "@/app/(app)/settings/general/actions";

vi.mock("@/app/(app)/settings/general/actions", () => ({
  updateTimezoneAction: vi.fn(),
}));

const mockUpdateTimezoneAction = vi.mocked(updateTimezoneAction);

beforeEach(() => {
  mockUpdateTimezoneAction.mockReset();
});

describe("TimezoneSelect", () => {
  it("shows the initial timezone on the trigger", () => {
    render(<TimezoneSelect initialTimezone="America/Phoenix" />);
    expect(screen.getByRole("combobox", { name: "Timezone, America/Phoenix" })).toBeInTheDocument();
  });

  it("filters the list as the learner types", async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect initialTimezone="UTC" />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByLabelText("Search timezones"), "phoenix");

    expect(screen.getByRole("option", { name: "America/Phoenix" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "America/Mexico_City" })).not.toBeInTheDocument();
  });

  it("shows a no-match message for a query with no results", async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect initialTimezone="UTC" />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByLabelText("Search timezones"), "not-a-real-place");

    expect(screen.getByText("No timezones match.")).toBeInTheDocument();
  });

  it("saves the selected timezone and shows Saved", async () => {
    mockUpdateTimezoneAction.mockResolvedValueOnce({ ok: true, data: { timezone: "America/Phoenix" } });
    const user = userEvent.setup();
    render(<TimezoneSelect initialTimezone="UTC" />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByLabelText("Search timezones"), "phoenix");
    await user.click(screen.getByRole("option", { name: "America/Phoenix" }));

    expect(mockUpdateTimezoneAction).toHaveBeenCalledWith({ timezone: "America/Phoenix" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Timezone, America/Phoenix" })).toBeInTheDocument();
  });

  it("does not call the action when re-selecting the already-saved timezone", async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect initialTimezone="America/Phoenix" />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByLabelText("Search timezones"), "phoenix");
    await user.click(screen.getByRole("option", { name: "America/Phoenix" }));

    expect(mockUpdateTimezoneAction).not.toHaveBeenCalled();
  });

  it("surfaces a server error without losing the previously saved value", async () => {
    mockUpdateTimezoneAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "That isn't a recognized timezone." },
    });
    const user = userEvent.setup();
    render(<TimezoneSelect initialTimezone="UTC" />);

    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByLabelText("Search timezones"), "phoenix");
    await user.click(screen.getByRole("option", { name: "America/Phoenix" }));

    expect(await screen.findByText("That isn't a recognized timezone.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Timezone, UTC" })).toBeInTheDocument();
  });
});
