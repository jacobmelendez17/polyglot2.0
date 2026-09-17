import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VacationModeToggle } from "./vacation-mode-toggle";
import {
  disableVacationModeAction,
  enableVacationModeAction,
} from "@/app/(app)/settings/general/actions";

vi.mock("@/app/(app)/settings/general/actions", () => ({
  enableVacationModeAction: vi.fn(),
  disableVacationModeAction: vi.fn(),
}));

const mockEnable = vi.mocked(enableVacationModeAction);
const mockDisable = vi.mocked(disableVacationModeAction);

beforeEach(() => {
  mockEnable.mockReset();
  mockDisable.mockReset();
});

describe("VacationModeToggle", () => {
  it("renders with the label and description", () => {
    render(<VacationModeToggle initialValue={false} />);
    expect(screen.getByText("Vacation Mode")).toBeInTheDocument();
    expect(screen.getByText(/protect your streak/)).toBeInTheDocument();
  });

  it("calls enableVacationModeAction when turned on", async () => {
    mockEnable.mockResolvedValueOnce({
      ok: true,
      data: { vacationModeEnabled: true },
    });
    const user = userEvent.setup();
    render(<VacationModeToggle initialValue={false} />);

    await user.click(screen.getByRole("switch"));

    expect(mockEnable).toHaveBeenCalled();
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("calls disableVacationModeAction when turned off", async () => {
    mockDisable.mockResolvedValueOnce({
      ok: true,
      data: { vacationModeEnabled: false },
    });
    const user = userEvent.setup();
    render(<VacationModeToggle initialValue={true} />);

    await user.click(screen.getByRole("switch"));

    expect(mockDisable).toHaveBeenCalled();
    expect(mockEnable).not.toHaveBeenCalled();
  });
});
