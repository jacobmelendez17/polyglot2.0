import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LearningQueuePicker } from "./learning-queue-picker";
import { updateCurriculumPreferenceAction } from "@/app/(app)/settings/lessons/actions";

vi.mock("@/app/(app)/settings/lessons/actions", () => ({
  updateCurriculumPreferenceAction: vi.fn(),
}));

const mockAction = vi.mocked(updateCurriculumPreferenceAction);

const THEMES = [
  { id: "group-numbers", name: "Numbers", remainingCount: 4, kind: "vocabulary" as const },
  { id: "group-colors", name: "Colors", remainingCount: 8, kind: "vocabulary" as const },
];

beforeEach(() => {
  mockAction.mockReset();
});

describe("LearningQueuePicker", () => {
  // 2026-09-28 user request: every Settings card requires an explicit Save
  // before anything is applied — this component's original "changes persist
  // immediately, no Continue button" design (and the bug it produced, see
  // below) is gone; every interaction now only drafts locally until Save.
  it("does not save on mode selection alone — only once Save is clicked", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: {
        curriculumMode: "default_order",
        selectedVocabularyGroupId: null,
      },
    });
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="variety"
        initialThemeId={null}
        themes={THEMES}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /default order/i }));
    expect(mockAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "default_order",
      selectedVocabularyGroupId: null,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("Cancel reverts mode and theme back to what's applied without saving", async () => {
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="default_order"
        initialThemeId={null}
        themes={THEMES}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /theme selection/i }));
    await user.click(screen.getByRole("radio", { name: /Colors/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("radio", { name: /default order/i })).toBeChecked();
    expect(mockAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  // Regression, found 2026-09-27 from a real user report ("it's not
  // saving") under the old auto-save design: switching to Theme Selection
  // with no group picked yet was a silent no-op — nothing was saved until a
  // group was also clicked, so a reload right after switching modes
  // reverted straight back to the previous mode with no error. The new
  // explicit-Save design makes this structurally impossible — mode and
  // theme are drafted together and saved together in one request, whatever
  // combination is currently drafted.
  it("saves the mode with no theme picked yet in one request when Save is clicked", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { curriculumMode: "choose_group", selectedVocabularyGroupId: null },
    });
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="variety"
        initialThemeId={null}
        themes={THEMES}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /theme selection/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: null,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    mockAction.mockResolvedValueOnce({
      ok: true,
      data: {
        curriculumMode: "choose_group",
        selectedVocabularyGroupId: "group-colors",
      },
    });
    await user.click(screen.getByRole("radio", { name: /Colors/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "group-colors",
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("offers no Save when re-entering Theme Selection with its already-applied group still selected", async () => {
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="choose_group"
        initialThemeId="group-numbers"
        themes={THEMES}
      />,
    );

    // Switch away and back to the mode it already started in, with the
    // same theme still selected — nothing has actually changed.
    await user.click(screen.getByRole("radio", { name: /default order/i }));
    await user.click(screen.getByRole("radio", { name: /theme selection/i }));

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("keeps the draft and shows the server error without silently succeeding", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Could not save setting. Please try again.",
      },
    });
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="variety"
        initialThemeId={null}
        themes={THEMES}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /default order/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Could not save setting. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /default order/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
