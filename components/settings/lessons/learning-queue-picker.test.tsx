import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LearningQueuePicker } from "./learning-queue-picker";
import { updateCurriculumPreferenceAction } from "@/app/(app)/settings/lessons/actions";

vi.mock("@/app/(app)/settings/lessons/actions", () => ({
  updateCurriculumPreferenceAction: vi.fn(),
}));

const mockAction = vi.mocked(updateCurriculumPreferenceAction);

beforeEach(() => {
  mockAction.mockReset();
});

describe("LearningQueuePicker", () => {
  // 2026-09-28 user request: theme choice belongs to the lesson-start "What
  // next?" screen, not Settings — Settings only ever picks the mode, the
  // same split onboarding's own picker already uses. There is no theme
  // sub-picker to render here at all.
  it("renders no theme sub-picker, even for Theme Selection", async () => {
    const user = userEvent.setup();
    render(<LearningQueuePicker initialMode="variety" />);

    await user.click(screen.getByRole("radio", { name: /theme selection/i }));

    expect(screen.queryByText(/which theme first/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /numbers|colors/i })).not.toBeInTheDocument();
  });

  it("does not save on mode selection alone — only once Save is clicked", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: {
        curriculumMode: "default_order",
        selectedVocabularyGroupId: null,
      },
    });
    const user = userEvent.setup();
    render(<LearningQueuePicker initialMode="variety" />);

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

  it("Cancel reverts the mode back to what's applied without saving", async () => {
    const user = userEvent.setup();
    render(<LearningQueuePicker initialMode="default_order" />);

    await user.click(screen.getByRole("radio", { name: /theme selection/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("radio", { name: /default order/i })).toBeChecked();
    expect(mockAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  // Switching *into* Theme Selection always clears any theme id, exactly
  // like onboarding's identical `showThemeSelection={false}` picker does —
  // Settings never learns or preserves which theme was previously active,
  // so the next lesson start always asks.
  it("saves Theme Selection with no theme id, letting the next lesson start ask", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { curriculumMode: "choose_group", selectedVocabularyGroupId: null },
    });
    const user = userEvent.setup();
    render(<LearningQueuePicker initialMode="variety" />);

    await user.click(screen.getByRole("radio", { name: /theme selection/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: null,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("offers no Save when re-entering the already-applied mode", async () => {
    const user = userEvent.setup();
    render(<LearningQueuePicker initialMode="choose_group" />);

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
    render(<LearningQueuePicker initialMode="variety" />);

    await user.click(screen.getByRole("radio", { name: /default order/i }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Could not save setting. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /default order/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
