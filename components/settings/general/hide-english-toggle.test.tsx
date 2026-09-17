import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HideEnglishToggle } from "./hide-english-toggle";
import { updateContentPreferencesAction } from "@/app/(app)/settings/general/actions";

vi.mock("@/app/(app)/settings/general/actions", () => ({
  updateContentPreferencesAction: vi.fn(),
}));

const mockAction = vi.mocked(updateContentPreferencesAction);

describe("HideEnglishToggle", () => {
  it("renders with the correct label and initial state", () => {
    render(<HideEnglishToggle initialValue={false} />);
    expect(screen.getByText("Hide English during Reviews")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("calls updateContentPreferencesAction with only hideEnglishReviews", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { hideEnglishReviews: true, showNsfwContent: false },
    });
    const user = userEvent.setup();
    render(<HideEnglishToggle initialValue={false} />);

    await user.click(screen.getByRole("switch"));

    expect(mockAction).toHaveBeenCalledWith({ hideEnglishReviews: true });
  });
});
