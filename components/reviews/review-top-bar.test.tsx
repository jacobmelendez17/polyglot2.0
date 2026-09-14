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

  it("Focus Mode (spec 20 Review UI) hides the accuracy percentage but keeps Exit, progress, and remaining count", () => {
    render(<ReviewTopBar onExit={() => {}} progressPercent={50} remaining={4} accuracyPercent={80} focusMode />);

    expect(screen.getByText(/4 left/)).toBeInTheDocument();
    expect(screen.queryByText(/80%/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit review" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Review progress" })).toBeInTheDocument();
  });
});
