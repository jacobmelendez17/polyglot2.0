import type { ReactElement, ReactNode } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const report = vi.hoisted(() => vi.fn());
const shouldReportAnalyticsIntents = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const startReviewSession = vi.hoisted(() => vi.fn());

vi.mock("@/app/analytics-actions", () => ({
  captureAnalyticsIntentAction: report,
}));
vi.mock("@/domains/analytics/server", () => ({ shouldReportAnalyticsIntents }));
vi.mock("@/domains/users/server", () => ({ requireUser }));
vi.mock("@/domains/srs/server", () => ({ startReviewSession }));
// `AnalyticsIntent` is deliberately the real one, so the page, the component
// and the action are exercised together.
vi.mock("@/components/reviews/review-session-view", () => ({
  ReviewSessionView: () => <div data-testid="session-view" />,
}));
vi.mock("@/components/reviews/review-empty-state", () => ({
  ReviewEmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock("@/components/reviews/review-loading-skeleton", () => ({
  ReviewLoadingSkeleton: () => <div data-testid="skeleton" />,
}));

import ReviewsPage from "./page";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";

beforeEach(() => {
  for (const fn of [
    report,
    shouldReportAnalyticsIntents,
    requireUser,
    startReviewSession,
  ]) {
    fn.mockReset();
  }
  report.mockResolvedValue({ ok: true, data: null });
  shouldReportAnalyticsIntents.mockResolvedValue(true);
  requireUser.mockResolvedValue({ id: "user-1", activeLanguageId: "lang-1" });
  startReviewSession.mockResolvedValue({
    kind: "session",
    sessionId: SESSION,
    token: "t",
  });
});

/** The page is a Suspense wrapper around an async Server Component; resolve the latter the way the server would. */
async function renderReviewsPage() {
  const page = ReviewsPage() as ReactElement<{ children: ReactElement }>;
  const content = page.props.children;
  const tree = await (content.type as (props: unknown) => Promise<ReactNode>)(
    content.props,
  );
  render(<>{tree}</>);
}

describe("Reviews page and the analytics report", () => {
  it("asks a consenting learner's browser to report the session that started, by its own id", async () => {
    await renderReviewsPage();

    expect(shouldReportAnalyticsIntents).toHaveBeenCalledWith("user-1");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      event: "review_session_started",
      sessionKey: SESSION,
    });
    expect(screen.getByTestId("session-view")).toBeInTheDocument();
  });

  it("renders the session and reports nothing for a learner who is not consenting", async () => {
    shouldReportAnalyticsIntents.mockResolvedValue(false);

    await renderReviewsPage();

    expect(report).not.toHaveBeenCalled();
    expect(screen.getByTestId("session-view")).toBeInTheDocument();
  });

  it("neither asks about consent nor reports when nothing is due", async () => {
    startReviewSession.mockResolvedValue({ kind: "empty", nextReviewAt: null });

    await renderReviewsPage();

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(shouldReportAnalyticsIntents).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
