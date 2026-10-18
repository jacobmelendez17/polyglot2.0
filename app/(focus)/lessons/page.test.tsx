import type { ReactElement, ReactNode } from "react";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const report = vi.hoisted(() => vi.fn());
const shouldReportAnalyticsIntents = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const isVacationModeActive = vi.hoisted(() => vi.fn());
const getLanguageById = vi.hoisted(() => vi.fn());
const startLesson = vi.hoisted(() => vi.fn());

vi.mock("@/app/analytics-actions", () => ({
  captureAnalyticsIntentAction: report,
}));
vi.mock("@/domains/analytics/server", () => ({ shouldReportAnalyticsIntents }));
vi.mock("@/domains/users/server", () => ({
  requireUser,
  isVacationModeActive,
}));
vi.mock("@/domains/curriculum/server", () => ({ getLanguageById }));
vi.mock("@/domains/lessons/server", () => ({ startLesson }));
// Each of these has its own tests; here they only have to show what they were
// handed. `AnalyticsIntent` is deliberately the real one, so the page, the
// component and the action are exercised together.
vi.mock("@/components/lessons/lesson-session-view", () => ({
  LessonSessionView: () => <div data-testid="session-view" />,
}));
vi.mock("@/components/lessons/lesson-theme-picker", () => ({
  LessonThemePicker: (props: { reportIntent?: unknown }) => (
    <div
      data-testid="theme-picker"
      data-reporting={String(props.reportIntent === report)}
    />
  ),
}));
vi.mock("@/components/lessons/lesson-empty-state", () => ({
  LessonEmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock("@/components/lessons/lesson-vacation-warning", () => ({
  LessonVacationWarning: () => <div data-testid="vacation-warning" />,
}));
vi.mock("@/components/lessons/lesson-study-skeleton", () => ({
  LessonStudySkeleton: () => <div data-testid="skeleton" />,
}));

import LessonsPage from "./page";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";

beforeEach(() => {
  for (const fn of [
    report,
    shouldReportAnalyticsIntents,
    requireUser,
    isVacationModeActive,
    getLanguageById,
    startLesson,
  ]) {
    fn.mockReset();
  }
  report.mockResolvedValue({ ok: true, data: null });
  shouldReportAnalyticsIntents.mockResolvedValue(true);
  requireUser.mockResolvedValue({ id: "user-1", activeLanguageId: "lang-1" });
  isVacationModeActive.mockResolvedValue(false);
  getLanguageById.mockResolvedValue({ id: "lang-1", code: "es-MX" });
  startLesson.mockResolvedValue({
    kind: "session",
    sessionId: SESSION,
    token: "t",
  });
});

/** The page is a Suspense wrapper around an async Server Component; resolve the latter the way the server would. */
async function renderLessonsPage(search: { vacationConfirmed?: string } = {}) {
  const page = LessonsPage({
    searchParams: Promise.resolve(search),
  }) as ReactElement<{ children: ReactElement }>;
  const content = page.props.children;
  const tree = await (content.type as (props: unknown) => Promise<ReactNode>)(
    content.props,
  );
  render(<>{tree}</>);
}

describe("Lessons page and the analytics report", () => {
  it("asks a consenting learner's browser to report the session that started, by its own id", async () => {
    await renderLessonsPage();

    expect(shouldReportAnalyticsIntents).toHaveBeenCalledWith("user-1");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      event: "lesson_started",
      sessionKey: SESSION,
    });
    expect(screen.getByTestId("session-view")).toBeInTheDocument();
  });

  it("renders the lesson and reports nothing for a learner who is not consenting", async () => {
    shouldReportAnalyticsIntents.mockResolvedValue(false);

    await renderLessonsPage();

    expect(report).not.toHaveBeenCalled();
    expect(screen.getByTestId("session-view")).toBeInTheDocument();
  });

  it("hands the report to the theme picker for a consenting learner, which starts the lesson itself", async () => {
    startLesson.mockResolvedValue({ kind: "choose-theme", themes: [] });

    await renderLessonsPage();

    expect(screen.getByTestId("theme-picker")).toHaveAttribute(
      "data-reporting",
      "true",
    );
    // Nothing has started yet, so nothing is reported by the page.
    expect(report).not.toHaveBeenCalled();
  });

  it("gives the theme picker nothing to report with when the learner is not consenting", async () => {
    startLesson.mockResolvedValue({ kind: "choose-theme", themes: [] });
    shouldReportAnalyticsIntents.mockResolvedValue(false);

    await renderLessonsPage();

    expect(screen.getByTestId("theme-picker")).toHaveAttribute(
      "data-reporting",
      "false",
    );
  });

  it("neither asks about consent nor reports when there is nothing to learn", async () => {
    startLesson.mockResolvedValue({ kind: "empty" });

    await renderLessonsPage();

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(shouldReportAnalyticsIntents).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("neither asks about consent nor reports while the vacation warning is up", async () => {
    isVacationModeActive.mockResolvedValue(true);

    await renderLessonsPage();

    expect(screen.getByTestId("vacation-warning")).toBeInTheDocument();
    expect(startLesson).not.toHaveBeenCalled();
    expect(shouldReportAnalyticsIntents).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
