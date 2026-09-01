import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ExitLessonButton } from "@/components/lessons/exit-lesson-button";

describe("ExitLessonButton", () => {
  it("has an accessible name despite showing no visible text", () => {
    render(<ExitLessonButton onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Exit lesson" });
    expect(button).toBeInTheDocument();
    expect(button.textContent?.trim()).toBe("");
  });

  it("calls onClick when activated", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ExitLessonButton onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Exit lesson" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
