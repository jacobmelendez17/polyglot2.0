import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GrammarPlacementSelect } from "./grammar-placement-select";
import { updateGrammarPlacementAction } from "@/app/(app)/settings/lessons/actions";

vi.mock("@/app/(app)/settings/lessons/actions", () => ({
  updateGrammarPlacementAction: vi.fn(),
}));

const mockAction = vi.mocked(updateGrammarPlacementAction);

beforeEach(() => {
  mockAction.mockReset();
});

describe("GrammarPlacementSelect", () => {
  it("shows the initial value and explains it only applies to Variety", () => {
    render(<GrammarPlacementSelect initialValue="no_preference" />);
    expect(screen.getByText("No Preference")).toBeInTheDocument();
    expect(screen.getByText(/only applies to variety/i)).toBeInTheDocument();
  });

  it("saves the new placement and shows Saved", async () => {
    mockAction.mockResolvedValueOnce({
      ok: true,
      data: { grammarPlacement: "first" },
    });
    const user = userEvent.setup();
    render(<GrammarPlacementSelect initialValue="no_preference" />);

    await user.click(
      screen.getByRole("combobox", { name: "Grammar Placement" }),
    );
    await user.click(screen.getByRole("option", { name: "First" }));

    expect(mockAction).toHaveBeenCalledWith({ grammarPlacement: "first" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("reverts to the previous value and shows the error when the save fails", async () => {
    mockAction.mockResolvedValueOnce({
      ok: false,
      error: { code: "UNKNOWN", message: "Could not save setting." },
    });
    const user = userEvent.setup();
    render(<GrammarPlacementSelect initialValue="no_preference" />);

    await user.click(
      screen.getByRole("combobox", { name: "Grammar Placement" }),
    );
    await user.click(screen.getByRole("option", { name: "Last" }));

    expect(
      await screen.findByText("Could not save setting."),
    ).toBeInTheDocument();
    expect(screen.getByText("No Preference")).toBeInTheDocument();
  });
});
