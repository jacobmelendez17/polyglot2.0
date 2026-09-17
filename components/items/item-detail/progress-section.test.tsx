import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProgressSection } from "@/components/items/item-detail/progress-section";
import type { ItemProgress } from "@/domains/progress";

const NOW = new Date("2026-09-09T12:00:00Z");
const UNLOCKED = new Date("2026-09-01T09:00:00Z");

function progress(overrides: Partial<ItemProgress> = {}): ItemProgress {
  return {
    userId: "user-1",
    learningItemId: "item-1",
    languageId: "lang-1",
    srsStage: "familiar_1",
    learnedAt: new Date("2026-09-02T00:00:00Z"),
    nextReviewAt: new Date("2026-09-10T12:00:00Z"),
    fluentAt: null,
    correctCount: 8,
    incorrectCount: 2,
    reviewCount: 10,
    lastReviewedAt: new Date("2026-09-08T00:00:00Z"),
    currentCorrectStreak: 8,
    highestSrsStageReached: "familiar_1",
    version: 3,
    ...overrides,
  };
}

describe("ProgressSection", () => {
  it("shows every metric spec 18 requires", () => {
    render(
      <ProgressSection
        progress={progress()}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );

    for (const label of [
      "Current Stage",
      "Next Review",
      "Unlock Date",
      "Accuracy",
      "Times Studied",
      "Retired Date",
      "Leech",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Familiar 1")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("never shows First Studied (spec 18)", () => {
    render(
      <ProgressSection
        progress={progress()}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );
    expect(screen.queryByText("First Studied")).not.toBeInTheDocument();
  });

  it("shows the plain date once a review is a day or more out", () => {
    render(
      <ProgressSection
        progress={progress()}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText("Sep 10, 2026")).toBeInTheDocument();
  });

  it("counts down in hours, then minutes, as a review gets closer", () => {
    const { rerender } = render(
      <ProgressSection
        progress={progress({ nextReviewAt: new Date("2026-09-09T18:00:00Z") })}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText("6 hours")).toBeInTheDocument();

    rerender(
      <ProgressSection
        progress={progress({ nextReviewAt: new Date("2026-09-09T12:20:00Z") })}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText("20 minutes")).toBeInTheDocument();

    rerender(
      <ProgressSection
        progress={progress({ nextReviewAt: new Date("2026-09-09T12:00:30Z") })}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );
    expect(screen.getByText("~ Less than a minute")).toBeInTheDocument();
  });

  it("reports a completed cycle rather than a missing next review at Fluent", () => {
    render(
      <ProgressSection
        progress={progress({
          srsStage: "fluent",
          nextReviewAt: null,
          fluentAt: new Date("2026-09-07T00:00:00Z"),
        })}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );

    expect(screen.getByText("Review cycle complete")).toBeInTheDocument();
    expect(screen.getByText("Sep 7, 2026")).toBeInTheDocument();
  });

  it("shows an em dash for Retired Date when the item has not retired", () => {
    render(
      <ProgressSection
        progress={progress()}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );

    const retired = screen.getByText("Retired Date").parentElement;
    expect(retired).toHaveTextContent("—");
  });

  it("shows an em dash for Leech, because no leech rule exists to compute one", () => {
    render(
      <ProgressSection
        progress={progress()}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );

    const leech = screen.getByText("Leech").parentElement;
    // Deliberately not "No" — see the component's own comment and
    // progress-tracker.md's Open Questions.
    expect(leech).toHaveTextContent("—");
    expect(leech).not.toHaveTextContent("No");
  });

  it("treats an unstudied item as a real state, not an error, and still shows its unlock date", () => {
    render(
      <ProgressSection
        progress={null}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );

    expect(screen.getByText(/Not yet studied/)).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, 2026")).toBeInTheDocument();
  });

  it("renders dates in the learner's timezone, not the runtime's", () => {
    // 2026-09-01T09:00Z is still Aug 31 in Los Angeles.
    render(
      <ProgressSection
        progress={null}
        levelUnlockedAt={new Date("2026-09-01T03:00:00Z")}
        timeZone="America/Los_Angeles"
        now={NOW}
      />,
    );
    expect(screen.getByText("Aug 31, 2026")).toBeInTheDocument();
  });

  it("reserves a replaceable area for the future SRS-stage visualization", () => {
    render(
      <ProgressSection
        progress={progress()}
        levelUnlockedAt={UNLOCKED}
        timeZone="UTC"
        now={NOW}
      />,
    );
    expect(
      screen.getByText("Stage visualization coming soon"),
    ).toBeInTheDocument();
  });
});
