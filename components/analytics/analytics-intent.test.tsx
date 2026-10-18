import { StrictMode } from "react";

import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { AnalyticsIntent } from "@/components/analytics/analytics-intent";

const SESSION = "5d1c4a4e-2f5b-4a40-9a39-0f6f9f3b8c11";
const LESSON = { event: "lesson_started", sessionKey: SESSION } as const;

describe("AnalyticsIntent", () => {
  it("renders nothing", () => {
    const { container } = render(
      <AnalyticsIntent report={vi.fn(async () => null)} intent={LESSON} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the intent to the server once, when it mounts", () => {
    const report = vi.fn(async () => null);

    render(<AnalyticsIntent report={report} intent={LESSON} />);

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(LESSON);
  });

  it("reports once even under Strict Mode, which runs effects twice in development", () => {
    const report = vi.fn(async () => null);

    render(
      <StrictMode>
        <AnalyticsIntent report={report} intent={LESSON} />
      </StrictMode>,
    );

    expect(report).toHaveBeenCalledTimes(1);
  });

  it("does not report again when the page re-renders it", () => {
    const report = vi.fn(async () => null);
    const { rerender } = render(
      <AnalyticsIntent report={report} intent={LESSON} />,
    );

    rerender(<AnalyticsIntent report={report} intent={{ ...LESSON }} />);
    rerender(
      <AnalyticsIntent
        report={report}
        intent={{ event: "lesson_started", sessionKey: "another-session" }}
      />,
    );

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(LESSON);
  });

  it("reports a new mount as a new session", () => {
    const report = vi.fn(async () => null);

    const first = render(<AnalyticsIntent report={report} intent={LESSON} />);
    first.unmount();
    render(<AnalyticsIntent report={report} intent={LESSON} />);

    expect(report).toHaveBeenCalledTimes(2);
  });

  it("reports each kind of start with exactly what it was given", () => {
    const report = vi.fn(async () => null);

    render(
      <AnalyticsIntent
        report={report}
        intent={{ event: "onboarding_started" }}
      />,
    );
    render(
      <AnalyticsIntent
        report={report}
        intent={{ event: "review_session_started", sessionKey: SESSION }}
      />,
    );

    expect(report).toHaveBeenNthCalledWith(1, { event: "onboarding_started" });
    expect(report).toHaveBeenNthCalledWith(2, {
      event: "review_session_started",
      sessionKey: SESSION,
    });
  });

  it("swallows a rejected report — offline, rate limited, a server error — so it never reaches the page", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      // A plain function, not `vi.fn`: the spy chains its own handler onto a
      // promise it returns, which would mark the rejection as handled and make
      // this test unable to notice an escape.
      let calls = 0;
      const report = () => {
        calls += 1;
        return Promise.reject(new Error("offline"));
      };
      expect(() =>
        render(<AnalyticsIntent report={report} intent={LESSON} />),
      ).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(calls).toBe(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("swallows a report that throws before it even returns a promise", () => {
    const report = vi.fn(() => {
      throw new Error("the action could not be called");
    });

    expect(() =>
      render(<AnalyticsIntent report={report} intent={LESSON} />),
    ).not.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("accepts a report that returns nothing at all", () => {
    const report = vi.fn(() => undefined) as never;

    expect(() =>
      render(<AnalyticsIntent report={report} intent={LESSON} />),
    ).not.toThrow();
  });
});
