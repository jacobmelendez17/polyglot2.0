import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import type { DashboardData } from "@/domains/dashboard";

const STREAK = [
  { date: "2026-08-24", label: "Mon", isActive: true, isToday: false },
  { date: "2026-08-25", label: "Tue", isActive: true, isToday: false },
  { date: "2026-08-26", label: "Wed", isActive: false, isToday: false },
  { date: "2026-08-27", label: "Thu", isActive: true, isToday: false },
  { date: "2026-08-28", label: "Fri", isActive: false, isToday: false },
  { date: "2026-08-29", label: "Sat", isActive: false, isToday: false },
  { date: "2026-08-30", label: "Sun", isActive: false, isToday: true },
];

const INACTIVE_STREAK = STREAK.map((day, index) => ({
  ...day,
  isActive: false,
  isToday: index === 6,
}));

const POPULATED_DASHBOARD: DashboardData = {
  lessons: { availableCount: 6 },
  reviews: { availableCount: 14, nextReviewAt: null },
  forecast: {
    "24h": [
      {
        timestamp: "2026-08-30T12:00:00.000Z",
        label: "12p",
        vocabularyCount: 3,
        grammarCount: 1,
      },
    ],
    "7d": [
      {
        timestamp: "2026-08-30T12:00:00.000Z",
        label: "Sun",
        vocabularyCount: 12,
        grammarCount: 5,
      },
    ],
  },
  reviewHistory: {
    "24h": [
      { timestamp: "2026-08-30T09:00:00.000Z", label: "9a", completedCount: 5 },
    ],
    "7d": [
      {
        timestamp: "2026-08-24T12:00:00.000Z",
        label: "Mon",
        completedCount: 18,
      },
    ],
    "30d": [
      {
        timestamp: "2026-08-01T12:00:00.000Z",
        label: "8/1",
        completedCount: 45,
      },
    ],
  },
  levelProgress: {
    currentLevel: 3,
    streak: STREAK,
    vocabulary: { learned: 31, total: 48 },
    grammar: { learned: 7, total: 12 },
    overall: { learned: 38, total: 60 },
  },
  stageProgress: [
    { stage: "beginner", label: "Beginner", vocabularyCount: 12, grammarCount: 3 },
    { stage: "familiar", label: "Familiar", vocabularyCount: 9, grammarCount: 2 },
    { stage: "intermediate", label: "Intermediate", vocabularyCount: 6, grammarCount: 1 },
    { stage: "master", label: "Master", vocabularyCount: 3, grammarCount: 1 },
    { stage: "fluent", label: "Fluent", vocabularyCount: 1, grammarCount: 0 },
  ],
};

const NEW_USER_DASHBOARD: DashboardData = {
  lessons: { availableCount: 6 },
  reviews: { availableCount: 0, nextReviewAt: null },
  forecast: { "24h": [], "7d": [] },
  reviewHistory: { "24h": [], "7d": [], "30d": [] },
  levelProgress: {
    currentLevel: 1,
    streak: INACTIVE_STREAK,
    vocabulary: { learned: 0, total: 48 },
    grammar: { learned: 0, total: 12 },
    overall: { learned: 0, total: 60 },
  },
  stageProgress: [
    { stage: "beginner", label: "Beginner", vocabularyCount: 0, grammarCount: 0 },
    { stage: "familiar", label: "Familiar", vocabularyCount: 0, grammarCount: 0 },
    { stage: "intermediate", label: "Intermediate", vocabularyCount: 0, grammarCount: 0 },
    { stage: "master", label: "Master", vocabularyCount: 0, grammarCount: 0 },
    { stage: "fluent", label: "Fluent", vocabularyCount: 0, grammarCount: 0 },
  ],
};

describe("DashboardView", () => {
  it("renders every required section for a populated dashboard", () => {
    render(<DashboardView data={POPULATED_DASHBOARD} />);

    expect(
      screen.getByRole("heading", { name: "Lessons" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Reviews" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Item Forecast" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Review History" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Level Progress" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Progress" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Practice" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Speaking" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Listening" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reading" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Writing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "News" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Community" }),
    ).toBeInTheDocument();
  });

  it("renders the new-user empty states instead of populated data", () => {
    render(<DashboardView data={NEW_USER_DASHBOARD} />);

    expect(screen.getByText("No reviews due yet")).toBeInTheDocument();
    expect(screen.getByText("No reviews forecasted")).toBeInTheDocument();
    expect(screen.getByText("No review history yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Start lessons" }).length,
    ).toBeGreaterThan(0);
  });
});
