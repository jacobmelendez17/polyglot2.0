import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LevelViewControls } from "@/components/levels/level-view-controls";

describe("LevelViewControls", () => {
  it("every control has an accessible name, even though icons are shown instead of labels", () => {
    render(<LevelViewControls value="normal" onChange={() => {}} />);

    expect(screen.getByRole("radio", { name: "Larger cards" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Default cards" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Smaller cards" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "List" })).toBeInTheDocument();
  });

  it("marks the current mode as pressed/checked", () => {
    render(<LevelViewControls value="compact" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Smaller cards" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Default cards" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the newly selected mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LevelViewControls value="normal" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Larger cards" }));
    expect(onChange).toHaveBeenCalledWith("large");
  });
});
