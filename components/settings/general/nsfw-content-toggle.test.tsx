import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NsfwContentToggle } from "./nsfw-content-toggle";
import { updateContentPreferencesAction } from "@/app/(app)/settings/general/actions";

vi.mock("@/app/(app)/settings/general/actions", () => ({
  updateContentPreferencesAction: vi.fn(),
}));

const mockAction = vi.mocked(updateContentPreferencesAction);

describe("NsfwContentToggle", () => {
  it("renders with the correct label and initial state", () => {
    render(<NsfwContentToggle initialValue={false} />);
    expect(screen.getByText("Show NSFW Content")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("calls updateContentPreferencesAction with only showNsfwContent", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { hideEnglishReviews: false, showNsfwContent: true },
    });
    const user = userEvent.setup();
    render(<NsfwContentToggle initialValue={false} />);

    await user.click(screen.getByRole("switch"));

    expect(mockAction).toHaveBeenCalledWith({ showNsfwContent: true });
  });
});
