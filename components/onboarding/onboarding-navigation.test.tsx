import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OnboardingNavigation } from "@/components/onboarding/onboarding-navigation";

function renderNav(overrides: Partial<Parameters<typeof OnboardingNavigation>[0]> = {}) {
  const props = {
    isFirstSlide: false,
    isLastSlide: false,
    isCompleting: false,
    onBack: vi.fn(),
    onNext: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  };
  const view = render(<OnboardingNavigation {...props} />);
  return { ...view, props };
}

describe("OnboardingNavigation (spec 15)", () => {
  it("shows Back and Next on a middle slide", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
  });

  it("disables Back on slide 1 rather than removing it, so the layout stays put", () => {
    renderNav({ isFirstSlide: true });
    expect(screen.getByRole("button", { name: /Back/ })).toBeDisabled();
  });

  it("swaps Next for Start Now! on the final slide", () => {
    renderNav({ isLastSlide: true });
    expect(screen.queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Now!" })).toBeInTheDocument();
  });

  it("gives Start Now! its own accent color and the one-shot emphasis animation", () => {
    renderNav({ isLastSlide: true });
    const button = screen.getByRole("button", { name: "Start Now!" });
    expect(button.className).toContain("animate-ob-emphasis");
    expect(button.className).toContain("bg-srs-fluent");
  });

  it("uses real buttons, so navigation is keyboard operable without extra wiring", async () => {
    const user = userEvent.setup();
    const { props } = renderNav();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(props.onNext).toHaveBeenCalled();
  });

  it("routes clicks to the right handler", async () => {
    const user = userEvent.setup();
    const { props } = renderNav();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onFinish).not.toHaveBeenCalled();
  });

  it("blocks further Start Now! clicks while a completion is in flight", async () => {
    const user = userEvent.setup();
    const { props } = renderNav({ isLastSlide: true, isCompleting: true });
    const button = screen.getByRole("button", { name: "Start Now!" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(props.onFinish).not.toHaveBeenCalled();
  });
});
