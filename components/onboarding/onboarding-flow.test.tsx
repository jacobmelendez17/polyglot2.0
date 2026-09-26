import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OnboardingFlow } from "./onboarding-flow";
import { ONBOARDING_SLIDES } from "./onboarding-slides";
import { completeOnboardingAction } from "@/app/(onboarding)/onboarding/actions";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/app/(onboarding)/onboarding/actions", () => ({
  completeOnboardingAction: vi.fn(),
}));

const mockCompleteOnboardingAction = vi.mocked(completeOnboardingAction);

beforeEach(() => {
  mockReplace.mockReset();
  mockCompleteOnboardingAction.mockReset();
});

async function goToLastSlide(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < ONBOARDING_SLIDES.length - 1; i++) {
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
}

describe("OnboardingFlow replay", () => {
  it("finishing a replay returns to the given returnTo path and never writes completion (spec 20 Tours)", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow isReplay returnTo="/settings/account" />);

    await goToLastSlide(user);
    await user.click(screen.getByRole("button", { name: "Start Now!" }));

    expect(mockReplace).toHaveBeenCalledWith("/settings/account");
    expect(mockCompleteOnboardingAction).not.toHaveBeenCalled();
  });

  it("defaults to the Sandbox's own return path when returnTo is omitted (spec 15's original caller)", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow isReplay />);

    await goToLastSlide(user);
    await user.click(screen.getByRole("button", { name: "Start Now!" }));

    expect(mockReplace).toHaveBeenCalledWith("/admin/sandbox");
  });

  it("shows a preview banner during replay without Sandbox-specific wording, since Settings can trigger it too", () => {
    render(<OnboardingFlow isReplay returnTo="/settings/account" />);

    expect(
      screen.getByText(
        /finishing here will not change your onboarding status/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();
  });

  it("a normal (non-replay) run does write completion when finished", async () => {
    mockCompleteOnboardingAction.mockResolvedValueOnce({
      ok: true,
      data: null,
    });
    const user = userEvent.setup();
    render(<OnboardingFlow isReplay={false} />);

    await goToLastSlide(user);
    await user.click(screen.getByRole("button", { name: "Start Now!" }));

    expect(mockCompleteOnboardingAction).toHaveBeenCalled();
  });

  it("a normal (non-replay) run continues into the language choice next, not the curriculum choice directly", async () => {
    mockCompleteOnboardingAction.mockResolvedValueOnce({
      ok: true,
      data: null,
    });
    const user = userEvent.setup();
    render(<OnboardingFlow isReplay={false} />);

    await goToLastSlide(user);
    await user.click(screen.getByRole("button", { name: "Start Now!" }));

    expect(mockReplace).toHaveBeenCalledWith("/onboarding/language");
  });

  it("an Admin's replay chains into the given continueHref instead of ending, for the one-giant-flow preview (2026-09-26)", async () => {
    const user = userEvent.setup();
    render(
      <OnboardingFlow
        isReplay
        returnTo="/admin/sandbox"
        continueHref="/onboarding/language?replay=1"
      />,
    );

    await goToLastSlide(user);
    await user.click(screen.getByRole("button", { name: "Start Now!" }));

    expect(mockReplace).toHaveBeenCalledWith("/onboarding/language?replay=1");
    expect(mockCompleteOnboardingAction).not.toHaveBeenCalled();
  });
});
