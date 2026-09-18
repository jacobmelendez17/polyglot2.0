/**
 * View-model types for the dashboard read model. `getDashboardData`
 * (`dashboard-service.ts`) aggregates these from the `srs`, `curriculum`,
 * and `progress` domains, per architecture.md's `dashboard` boundary
 * ("does not calculate authoritative SRS or unlock state itself").
 * Components depend only on these types, not the aggregation itself.
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

/** The 5 general SRS stage groups shown on the Progress card — `beginner_1`..`beginner_4` collapse to `"beginner"`, `familiar_1`/`familiar_2` collapse to `"familiar"`, and the remaining 3 stages map 1:1. */
export type StageGroup =
  | "beginner"
  | "familiar"
  | "intermediate"
  | "master"
  | "fluent";

export type StageProgressBucket = {
  stage: StageGroup;
  label: string;
  vocabularyCount: number;
  grammarCount: number;
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
  /** Always the 5 groups in `SRS_STAGE_GROUP_ORDER`, zero-filled where the learner has nothing at that stage yet. */
  stageProgress: StageProgressBucket[];
};
