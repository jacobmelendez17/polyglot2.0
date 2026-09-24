import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { PracticeHub } from "@/components/practice/practice-hub";
import { buildPracticeHubView } from "@/domains/practice";
import type { PracticeTypeActivity } from "@/domains/practice";

const NOW = new Date("2026-09-23T12:00:00.000Z");

function renderHub(
  activity: PracticeTypeActivity[] = [],
  skillFilter: Parameters<typeof PracticeHub>[0]["skillFilter"] = "all",
) {
  return render(
    <PracticeHub
      view={buildPracticeHubView(activity, NOW)}
      skillFilter={skillFilter}
    />,
  );
}

describe("PracticeHub", () => {
  it("renders the walk, all four groves, and both feature cards", () => {
    renderHub();

    expect(
      screen.getByRole("heading", { name: /today's walk · about 20 minutes/i }),
    ).toBeInTheDocument();
    for (const name of ["Listening", "Speaking", "Reading", "Writing"]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Tests" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Grammar conjugations" }),
    ).toBeInTheDocument();
  });

  it("never links to a practice whose route does not exist yet", () => {
    renderHub();

    // Only the skill filter links exist; every practice is "Coming soon".
    const hubLinks = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hubLinks.every((href) => href?.startsWith("/practice"))).toBe(true);
    expect(screen.getAllByText("Coming soon").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole("button", { name: /start walk/i })).toBeDisabled();
  });

  it("shows a learner's real history and an honest empty state", () => {
    renderHub([
      {
        practiceType: "sentences",
        recentSessionCount: 4,
        lastCompletedAt: new Date("2026-09-21T12:00:00.000Z"),
      },
    ]);

    const writing = screen.getByRole("region", { name: "Writing" });
    expect(within(writing).getByText("2 days ago")).toBeInTheDocument();
    expect(
      within(writing).getByLabelText("4 sessions in the last 7 days"),
    ).toBeInTheDocument();
    // Journal was never practiced.
    expect(within(writing).getByText("Not tried yet")).toBeInTheDocument();
    const listening = screen.getByRole("region", { name: "Listening" });
    expect(
      within(listening).getByLabelText("0 sessions in the last 7 days"),
    ).toBeInTheDocument();
  });

  it("marks the active skill in the filter and shows only that grove", () => {
    renderHub([], "reading");

    const filter = screen.getByRole("navigation", { name: "Filter by skill" });
    expect(
      within(filter).getByRole("link", { name: /reading/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(filter).getByRole("link", { name: /^all/i }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("region", { name: "Reading" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Writing" }),
    ).not.toBeInTheDocument();
  });

  it("labels each filter with how many practices it holds", () => {
    renderHub();

    const filter = screen.getByRole("navigation", { name: "Filter by skill" });
    expect(within(filter).getByLabelText("2 practices")).toBeInTheDocument();
  });
});
