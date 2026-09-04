import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReviewTopBar } from "@/components/reviews/review-top-bar";

describe("ReviewTopBar", () => {
  it("shows the remaining count", () => {
    render(<ReviewTopBar onExit={() => {}} progressPercent={50} remaining={4} accuracyPercent={null} />);
    expect(screen.getByText(/4 left/)).toBeInTheDocument();
  });

  it("shows accuracy once available, and omits it before any attempt", () => {
    const { rerender } = render(<ReviewTopBar onExit={() => {}} progressPercent={0} remaining={6} accuracyPercent={null} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();

    rerender(<ReviewTopBar onExit={() => {}} progressPercent={20} remaining={5} accuracyPercent={80} />);
    expect(screen.getByText(/80%/)).toBeInTheDocument();
  });

  it("reflects the progress value on the progress bar", () => {
    render(<ReviewTopBar onExit={() => {}} progressPercent={65} remaining={2} accuracyPercent={90} />);
    expect(screen.getByRole("progressbar", { name: "Review progress" })).toHaveAttribute("aria-valuenow", "65");
  });

  it("calls onExit when the exit control is activated", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<ReviewTopBar onExit={onExit} progressPercent={0} remaining={6} accuracyPercent={null} />);

    await user.click(screen.getByRole("button", { name: "Exit review" }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
