import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VocabularyReviewTypeSelect } from "./vocabulary-review-type-select";
import { updateVocabularyReviewTypeAction } from "@/app/(app)/settings/reviews/actions";

vi.mock("@/app/(app)/settings/reviews/actions", () => ({
  updateVocabularyReviewTypeAction: vi.fn(),
}));

const mockAction = vi.mocked(updateVocabularyReviewTypeAction);

beforeEach(() => {
  mockAction.mockReset();
});

describe("VocabularyReviewTypeSelect", () => {
  it("shows the initial value", () => {
    render(<VocabularyReviewTypeSelect initialValue="flashcard" />);
    expect(
      screen.getByRole("combobox", { name: "Vocabulary Review Type" }),
    ).toHaveTextContent("Flashcard");
  });

  it("saves the new type and shows Saved", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { vocabularyReviewType: "cloze_flashcard" },
    });
    const user = userEvent.setup();
    render(<VocabularyReviewTypeSelect initialValue="cloze_manual" />);

    await user.click(
      screen.getByRole("combobox", { name: "Vocabulary Review Type" }),
    );
    await user.click(screen.getByRole("option", { name: "Cloze (Flashcard)" }));
    expect(mockAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockAction).toHaveBeenCalledWith({ reviewType: "cloze_flashcard" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("keeps the drafted value and shows the error when the save fails", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "Could not save setting." },
    });
    const user = userEvent.setup();
    render(<VocabularyReviewTypeSelect initialValue="cloze_manual" />);

    await user.click(
      screen.getByRole("combobox", { name: "Vocabulary Review Type" }),
    );
    await user.click(screen.getByRole("option", { name: "Flashcard" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Could not save setting."),
    ).toBeInTheDocument();
    // A failed save never applied — the drafted (unsaved) pick stays shown.
    expect(
      screen.getByRole("combobox", { name: "Vocabulary Review Type" }),
    ).toHaveTextContent("Flashcard");
  });
});
