import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const report = vi.hoisted(() => vi.fn());
const shouldReportAnalyticsIntents = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const isOnboardingRequired = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/app/analytics-actions", () => ({
  captureAnalyticsIntentAction: report,
}));
vi.mock("@/domains/analytics/server", () => ({ shouldReportAnalyticsIntents }));
vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/users", () => ({ isOnboardingRequired }));
vi.mock("@/domains/admin", () => ({ canAccessAdminArea: () => false }));
// `AnalyticsIntent` is deliberately the real one, so the page, the component
// and the action are exercised together.
vi.mock("@/components/onboarding/onboarding-flow", () => ({
  OnboardingFlow: (props: { isReplay?: boolean }) => (
    <div data-testid="flow" data-replay={String(Boolean(props.isReplay))} />
  ),
}));

import OnboardingPage from "./page";

beforeEach(() => {
  for (const fn of [
    report,
    shouldReportAnalyticsIntents,
    requireUser,
    isOnboardingRequired,
    redirect,
  ]) {
    fn.mockClear();
  }
  report.mockResolvedValue({ ok: true, data: null });
  shouldReportAnalyticsIntents.mockResolvedValue(true);
  requireUser.mockResolvedValue({ id: "user-1" });
  isOnboardingRequired.mockReturnValue(true);
});

async function renderOnboardingPage(search: { replay?: string } = {}) {
  render(await OnboardingPage({ searchParams: Promise.resolve(search) }));
}

describe("Onboarding page and the analytics report", () => {
  it("asks a consenting learner's browser to report that onboarding started", async () => {
    await renderOnboardingPage();

    expect(shouldReportAnalyticsIntents).toHaveBeenCalledWith("user-1");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ event: "onboarding_started" });
    expect(screen.getByTestId("flow")).toHaveAttribute("data-replay", "false");
  });

  it("shows the tour and reports nothing for a learner who is not consenting", async () => {
    shouldReportAnalyticsIntents.mockResolvedValue(false);

    await renderOnboardingPage();

    expect(report).not.toHaveBeenCalled();
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("does not count a replay as entering onboarding", async () => {
    await renderOnboardingPage({ replay: "1" });

    expect(screen.getByTestId("flow")).toHaveAttribute("data-replay", "true");
    expect(shouldReportAnalyticsIntents).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("sends someone who already finished onboarding on without reporting anything", async () => {
    isOnboardingRequired.mockReturnValue(false);

    await expect(renderOnboardingPage()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );

    expect(shouldReportAnalyticsIntents).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
