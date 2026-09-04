import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExitFocusButton } from "@/components/shared/exit-focus-button";

describe("ExitFocusButton", () => {
  it("has an accessible name from the given label despite showing no visible text", () => {
    render(<ExitFocusButton label="Exit lesson" onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Exit lesson" });
    expect(button).toBeInTheDocument();
    expect(button.textContent?.trim()).toBe("");
  });

  it("supports a different label for a different focus session", () => {
    render(<ExitFocusButton label="Exit review" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Exit review" })).toBeInTheDocument();
  });

  it("calls onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ExitFocusButton label="Exit lesson" onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Exit lesson" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
