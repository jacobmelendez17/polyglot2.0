import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LessonBatchSizeSelect } from "./lesson-batch-size-select";
import { updateLessonBatchSizeAction } from "@/app/(app)/settings/lessons/actions";

vi.mock("@/app/(app)/settings/lessons/actions", () => ({
  updateLessonBatchSizeAction: vi.fn(),
}));

const mockAction = vi.mocked(updateLessonBatchSizeAction);

beforeEach(() => {
  mockAction.mockReset();
});

describe("LessonBatchSizeSelect", () => {
  it("shows the initial value and offers every size from 3 through 15", async () => {
    const user = userEvent.setup();
    render(<LessonBatchSizeSelect initialValue={6} />);

    expect(screen.getByRole("combobox", { name: "Lesson Batch Size" })).toHaveTextContent("6");

    await user.click(screen.getByRole("combobox", { name: "Lesson Batch Size" }));
    for (const size of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      expect(screen.getByRole("option", { name: String(size) })).toBeInTheDocument();
    }
  });

  it("saves the new size as a number and shows Saved", async () => {
    mockAction.mockResolvedValueOnce({ ok: true, data: { lessonBatchSize: 10 } });
    const user = userEvent.setup();
    render(<LessonBatchSizeSelect initialValue={6} />);

    await user.click(screen.getByRole("combobox", { name: "Lesson Batch Size" }));
    await user.click(screen.getByRole("option", { name: "10" }));

    expect(mockAction).toHaveBeenCalledWith({ lessonBatchSize: 10 });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("reverts to the previous value and shows the error when the save fails", async () => {
    mockAction.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "Could not save setting." } });
    const user = userEvent.setup();
    render(<LessonBatchSizeSelect initialValue={6} />);

    await user.click(screen.getByRole("combobox", { name: "Lesson Batch Size" }));
    await user.click(screen.getByRole("option", { name: "12" }));

    expect(await screen.findByText("Could not save setting.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Lesson Batch Size" })).toHaveTextContent("6");
  });
});
