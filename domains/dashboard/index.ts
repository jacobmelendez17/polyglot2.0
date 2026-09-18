/**
 * Client-safe public surface for `domains/dashboard`: types only. The real
 * function, `getDashboardData`, transitively imports `db/client.ts` and
 * lives in `./server.ts` instead — see that file's docstring. Components
 * (`DashboardView` and its cards) depend only on these types, so nothing
 * here needs to change if the aggregation itself changes.
 */
export type {
  DashboardData,
  ForecastBucket,
  ForecastRange,
  LessonsSummary,
  LevelProgress,
  PracticeArea,
  ReviewHistoryPoint,
  ReviewHistoryRange,
  ReviewsSummary,
  StageGroup,
  StageProgressBucket,
  StreakDay,
} from "./dashboard-types";
