/**
 * View-model types for the dashboard read model.
 *
 * These shapes describe what `getDashboardData` returns today from a
 * temporary fixture (see `dashboard-fixtures.ts`) and what it will return
 * once it aggregates from the `srs`, `lessons`, and `progress` domains, per
 * architecture.md's `dashboard` boundary ("does not calculate authoritative
 * SRS or unlock state itself"). Components depend only on these types, so
 * swapping the fixture for a real aggregation later requires no UI change.
 */

export type ForecastRange = "24h" | "7d";
export type ReviewHistoryRange = "24h" | "7d" | "30d";

export type ForecastBucket = {
  /** ISO timestamp marking the start of this bucket. */
  timestamp: string;
  /** Short axis label, e.g. "2p" or "Tue". */
  label: string;
  vocabularyCount: number;
  grammarCount: number;
};

export type ReviewHistoryPoint = {
  timestamp: string;
  label: string;
  completedCount: number;
};

export type StreakDay = {
  /** ISO date (yyyy-mm-dd), Monday through Sunday of the current week. */
  date: string;
  label: string;
  isActive: boolean;
  isToday: boolean;
};

export type LevelProgress = {
  currentLevel: number;
  streak: StreakDay[];
  vocabulary: { learned: number; total: number };
  grammar: { learned: number; total: number };
  overall: { learned: number; total: number };
};

export type LessonsSummary = {
  availableCount: number;
};

export type ReviewsSummary = {
  availableCount: number;
  /** ISO timestamp of the next scheduled review, present only when none are available now. */
  nextReviewAt: string | null;
};

export type PracticeArea = "speaking" | "listening" | "reading" | "writing";

export type DashboardData = {
  lessons: LessonsSummary;
  reviews: ReviewsSummary;
  forecast: Record<ForecastRange, ForecastBucket[]>;
  reviewHistory: Record<ReviewHistoryRange, ReviewHistoryPoint[]>;
  levelProgress: LevelProgress;
};
