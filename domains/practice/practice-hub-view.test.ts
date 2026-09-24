import { describe, expect, it } from "vitest";

import {
  buildPracticeHubView,
  countLitActivityDots,
  filterGroves,
  parsePracticeSkillFilter,
} from "./practice-hub-view";
import type { PracticeTypeActivity } from "./practice-types";

const NOW = new Date("2026-09-23T12:00:00.000Z");

function activity(
  overrides: Partial<PracticeTypeActivity> &
    Pick<PracticeTypeActivity, "practiceType">,
): PracticeTypeActivity {
  return {
    recentSessionCount: 1,
    lastCompletedAt: new Date("2026-09-21T12:00:00.000Z"),
    ...overrides,
  };
}

describe("buildPracticeHubView", () => {
  it("groups practices under the four skills in a stable order", () => {
    const view = buildPracticeHubView([], NOW);

    expect(view.groves.map((grove) => grove.skill)).toEqual([
      "listening",
      "speaking",
      "reading",
      "writing",
    ]);
    expect(
      view.groves
        .find((grove) => grove.skill === "writing")
        ?.practices.map((practice) => practice.type),
    ).toEqual(["sentences", "journal"]);
  });

  it("shows a learner with no history as not tried yet, with zero sessions", () => {
    const view = buildPracticeHubView([], NOW);

    for (const grove of view.groves) {
      expect(grove.recentSessionCount).toBe(0);
      for (const practice of grove.practices) {
        expect(practice.lastPracticedLabel).toBeNull();
      }
    }
  });

  it("sums recent sessions across a skill's practices", () => {
    const view = buildPracticeHubView(
      [
        activity({ practiceType: "sentences", recentSessionCount: 3 }),
        activity({ practiceType: "journal", recentSessionCount: 1 }),
        activity({ practiceType: "listening", recentSessionCount: 2 }),
      ],
      NOW,
    );

    const count = (skill: string) =>
      view.groves.find((grove) => grove.skill === skill)?.recentSessionCount;
    expect(count("writing")).toBe(4);
    expect(count("listening")).toBe(2);
    expect(count("speaking")).toBe(0);
  });

  it("words the last-practiced time relative to the injected clock", () => {
    const view = buildPracticeHubView(
      [
        activity({
          practiceType: "sentences",
          lastCompletedAt: new Date("2026-09-21T12:00:00.000Z"),
        }),
      ],
      NOW,
    );

    const sentences = view.groves
      .flatMap((grove) => grove.practices)
      .find((practice) => practice.type === "sentences");
    expect(sentences?.lastPracticedLabel).toBe("2 days ago");
  });

  it("keeps conjugation out of the four groves and surfaces it as a feature", () => {
    const view = buildPracticeHubView(
      [activity({ practiceType: "conjugation", recentSessionCount: 9 })],
      NOW,
    );

    expect(
      view.groves.flatMap((grove) => grove.practices.map((p) => p.type)),
    ).not.toContain("conjugation");
    expect(view.groves.reduce((sum, g) => sum + g.recentSessionCount, 0)).toBe(
      0,
    );
    const conjugation = view.features.find((f) => f.id === "conjugation");
    expect(conjugation?.lastPracticedLabel).not.toBeNull();
    expect(conjugation?.tags).toContain("Preterite");
  });

  it("sums the walk's minutes and does not offer it while its routes are unbuilt", () => {
    const { walk } = buildPracticeHubView([], NOW);

    expect(walk.totalMinutes).toBe(20);
    expect(walk.steps.map((step) => step.type)).toEqual([
      "listening",
      "sentences",
      "journal",
    ]);
    expect(walk.startHref).toBeNull();
  });
});

describe("parsePracticeSkillFilter", () => {
  it.each(["listening", "speaking", "reading", "writing"])(
    "accepts %s",
    (skill) => {
      expect(parsePracticeSkillFilter(skill)).toBe(skill);
    },
  );

  it.each([undefined, "", "all", "grammar", "LISTENING"])(
    "falls back to all for %s",
    (value) => {
      expect(parsePracticeSkillFilter(value)).toBe("all");
    },
  );
});

describe("filterGroves", () => {
  const { groves } = buildPracticeHubView([], NOW);

  it("returns every grove for all", () => {
    expect(filterGroves(groves, "all")).toHaveLength(4);
  });

  it("narrows to the chosen skill", () => {
    expect(filterGroves(groves, "reading").map((g) => g.skill)).toEqual([
      "reading",
    ]);
  });
});

describe("countLitActivityDots", () => {
  it.each([
    [0, 0],
    [1, 1],
    [5, 5],
    [12, 5],
    [-3, 0],
  ])("%i sessions light %i dots, capped at five", (sessions, lit) => {
    expect(countLitActivityDots(sessions)).toBe(lit);
  });
});
