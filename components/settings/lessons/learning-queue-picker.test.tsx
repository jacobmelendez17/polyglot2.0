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
  { id: "group-numbers", name: "Numbers", remainingCount: 4 },
  { id: "group-colors", name: "Colors", remainingCount: 8 },
];

beforeEach(() => {
  mockAction.mockReset();
});

describe("LearningQueuePicker", () => {
  it("saves immediately when switching to Default Order", async () => {
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

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "default_order",
      selectedVocabularyGroupId: null,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("does not save Choose Group as You Go until a group is picked", async () => {
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="variety"
        initialThemeId={null}
        themes={THEMES}
      />,
    );

    await user.click(
      screen.getByRole("radio", { name: /choose group as you go/i }),
    );
    expect(mockAction).not.toHaveBeenCalled();

    mockAction.mockResolvedValueOnce({
      ok: true,
      data: {
        curriculumMode: "choose_group",
        selectedVocabularyGroupId: "group-colors",
      },
    });
    await user.click(screen.getByRole("radio", { name: /Colors/ }));

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "group-colors",
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("saves immediately when re-entering Choose Group as You Go with a group already selected", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: {
        curriculumMode: "choose_group",
        selectedVocabularyGroupId: "group-numbers",
      },
    });
    const user = userEvent.setup();
    render(
      <LearningQueuePicker
        initialMode="default_order"
        initialThemeId="group-numbers"
        themes={THEMES}
      />,
    );

    await user.click(
      screen.getByRole("radio", { name: /choose group as you go/i }),
    );

    expect(mockAction).toHaveBeenCalledWith({
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: "group-numbers",
    });
  });

  it("shows the server error without silently succeeding", async () => {
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

    expect(
      await screen.findByText("Could not save setting. Please try again."),
    ).toBeInTheDocument();
  });
});
