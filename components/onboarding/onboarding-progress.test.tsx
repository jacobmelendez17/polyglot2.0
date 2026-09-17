import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";

function dots(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("[aria-hidden='true'] > span"));
}

describe("OnboardingProgress (spec 15)", () => {
  it("renders one dot per slide, however far through the learner is", () => {
    const { container } = render(
      <OnboardingProgress currentIndex={2} total={5} />,
    );
    expect(dots(container)).toHaveLength(5);
  });

  it("announces the current step as text, since unlabelled dots tell a screen reader nothing", () => {
    render(<OnboardingProgress currentIndex={1} total={5} />);
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
  });

  it("distinguishes completed, current, and remaining slides", () => {
    const { container } = render(
      <OnboardingProgress currentIndex={2} total={5} />,
    );
    const [first, second, third, fourth, fifth] = dots(container);

    expect(first.className).toContain("bg-foreground/50");
    expect(second.className).toContain("bg-foreground/50");
    expect(third.className).toContain("bg-foreground");
    expect(third.className).not.toContain("bg-foreground/50");
    expect(fourth.className).toContain("bg-foreground/20");
    expect(fifth.className).toContain("bg-foreground/20");
  });

  it("keeps the indicator from shifting: exactly one dot is ever the wide one", () => {
    for (const currentIndex of [0, 1, 2, 3, 4]) {
      const { container, unmount } = render(
        <OnboardingProgress currentIndex={currentIndex} total={5} />,
      );
      const wide = dots(container).filter((dot) =>
        dot.className.includes("w-6"),
      );
      expect(wide).toHaveLength(1);
      unmount();
    }
  });

  it("marks nothing complete on the first slide", () => {
    const { container } = render(
      <OnboardingProgress currentIndex={0} total={5} />,
    );
    expect(
      dots(container).filter((dot) =>
        dot.className.includes("bg-foreground/50"),
      ),
    ).toHaveLength(0);
  });
});
