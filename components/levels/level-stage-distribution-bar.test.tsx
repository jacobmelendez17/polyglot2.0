import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelStageDistributionBar } from "@/components/levels/level-stage-distribution-bar";
import type { LevelStageDistribution } from "@/domains/curriculum";

const EMPTY: LevelStageDistribution = {
  locked: 0,
  inLesson: 0,
  beginner: 0,
  familiar: 0,
  intermediate: 0,
  master: 0,
  fluent: 0,
};

describe("LevelStageDistributionBar", () => {
  it("renders nothing for a level with no items at all", () => {
    const { container } = render(
      <LevelStageDistributionBar distribution={EMPTY} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("summarizes real counts in its accessible name, never color alone", () => {
    render(
      <LevelStageDistributionBar
        distribution={{ ...EMPTY, locked: 30, beginner: 10, fluent: 3 }}
      />,
    );
    const bar = screen.getByRole("img");
    expect(bar.getAttribute("aria-label")).toContain("30 Locked");
    expect(bar.getAttribute("aria-label")).toContain("10 Beginner");
    expect(bar.getAttribute("aria-label")).toContain("3 Fluent");
    expect(bar.getAttribute("aria-label")).toContain("out of 43 items");
  });

  it("omits a segment entirely for a bucket with zero items, rather than rendering a zero-width one", () => {
    render(
      <LevelStageDistributionBar
        distribution={{ ...EMPTY, locked: 10, fluent: 5 }}
      />,
    );
    const bar = screen.getByRole("img");
    // Only the two non-zero buckets produce a rendered segment.
    expect(bar.children).toHaveLength(2);
  });

  it("never mentions a bucket with zero items in its summary", () => {
    render(
      <LevelStageDistributionBar distribution={{ ...EMPTY, locked: 5 }} />,
    );
    const bar = screen.getByRole("img");
    expect(bar.getAttribute("aria-label")).not.toContain("Fluent");
    expect(bar.getAttribute("aria-label")).not.toContain("Beginner");
  });
});
