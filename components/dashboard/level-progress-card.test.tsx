import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LevelProgressCard } from "@/components/dashboard/level-progress-card";
import type { LevelProgress } from "@/domains/dashboard";

const levelProgress: LevelProgress = {
  currentLevel: 5,
  streak: [
    { date: "2026-08-24", label: "Mon", isActive: true, isToday: false },
    { date: "2026-08-25", label: "Tue", isActive: false, isToday: false },
    { date: "2026-08-26", label: "Wed", isActive: true, isToday: false },
    { date: "2026-08-27", label: "Thu", isActive: false, isToday: false },
    { date: "2026-08-28", label: "Fri", isActive: false, isToday: false },
    { date: "2026-08-29", label: "Sat", isActive: false, isToday: false },
    { date: "2026-08-30", label: "Sun", isActive: true, isToday: true },
  ],
  vocabulary: { learned: 20, total: 48 },
  grammar: { learned: 3, total: 12 },
  overall: { learned: 23, total: 60 },
};

describe("LevelProgressCard", () => {
  it("renders the supplied level and progress figures rather than hardcoded values", () => {
    render(<LevelProgressCard levelProgress={levelProgress} />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("20/48")).toBeInTheDocument();
    expect(screen.getByText("3/12")).toBeInTheDocument();
    expect(screen.getByText("23/60")).toBeInTheDocument();
  });

  it("renders one streak indicator per day, marking active days", () => {
    render(<LevelProgressCard levelProgress={levelProgress} />);

    expect(screen.getByRole("list", { name: "Weekly activity streak" }).children).toHaveLength(7);
    expect(screen.getByText(/Mon: active/)).toBeInTheDocument();
    expect(screen.getByText(/Tue: inactive/)).toBeInTheDocument();
  });
});
