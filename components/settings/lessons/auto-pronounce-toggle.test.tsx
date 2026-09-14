import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AutoPronounceToggle } from "./auto-pronounce-toggle";
import { updateAutoPronounceLessonsAction } from "@/app/(app)/settings/lessons/actions";

vi.mock("@/app/(app)/settings/lessons/actions", () => ({
  updateAutoPronounceLessonsAction: vi.fn(),
}));

const mockAction = vi.mocked(updateAutoPronounceLessonsAction);

beforeEach(() => {
  mockAction.mockReset();
});

describe("AutoPronounceToggle", () => {
  it("reflects the initial value", () => {
    render(<AutoPronounceToggle initialValue={true} />);
    expect(screen.getByRole("switch", { name: "Automatically pronounce new words" })).toBeChecked();
  });

  it("saves the new value and shows Saved", async () => {
    mockAction.mockResolvedValueOnce({ ok: true, data: { autoPronounceLessons: false } });
    const user = userEvent.setup();
    render(<AutoPronounceToggle initialValue={true} />);

    await user.click(screen.getByRole("switch", { name: "Automatically pronounce new words" }));

    expect(mockAction).toHaveBeenCalledWith({ autoPronounceLessons: false });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("reverts and shows the error when the save fails", async () => {
    mockAction.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "Could not save setting." } });
    const user = userEvent.setup();
    render(<AutoPronounceToggle initialValue={true} />);

    await user.click(screen.getByRole("switch", { name: "Automatically pronounce new words" }));

    expect(await screen.findByText("Could not save setting.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Automatically pronounce new words" })).toBeChecked();
  });
});
