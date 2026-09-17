import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GrammarReviewTypeSelect } from "./grammar-review-type-select";
import { updateGrammarReviewTypeAction } from "@/app/(app)/settings/reviews/actions";

vi.mock("@/app/(app)/settings/reviews/actions", () => ({
  updateGrammarReviewTypeAction: vi.fn(),
}));

const mockAction = vi.mocked(updateGrammarReviewTypeAction);

beforeEach(() => {
  mockAction.mockReset();
});

describe("GrammarReviewTypeSelect", () => {
  it("shows the initial value", () => {
    render(<GrammarReviewTypeSelect initialValue="cloze_manual" />);
    expect(
      screen.getByRole("combobox", { name: "Grammar Review Type" }),
    ).toHaveTextContent("Cloze (Manual)");
  });

  it("saves the new type and shows Saved", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { grammarReviewType: "flashcard" },
    });
    const user = userEvent.setup();
    render(<GrammarReviewTypeSelect initialValue="cloze_manual" />);

    await user.click(
      screen.getByRole("combobox", { name: "Grammar Review Type" }),
    );
    await user.click(screen.getByRole("option", { name: "Flashcard" }));

    expect(mockAction).toHaveBeenCalledWith({ reviewType: "flashcard" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("reverts to the previous value and shows the error when the save fails", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "Could not save setting." },
    });
    const user = userEvent.setup();
    render(<GrammarReviewTypeSelect initialValue="cloze_manual" />);

    await user.click(
      screen.getByRole("combobox", { name: "Grammar Review Type" }),
    );
    await user.click(screen.getByRole("option", { name: "Cloze (Flashcard)" }));

    expect(
      await screen.findByText("Could not save setting."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Grammar Review Type" }),
    ).toHaveTextContent("Cloze (Manual)");
  });
});
