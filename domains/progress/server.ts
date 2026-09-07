/**
 * Server-only entry point for `domains/progress`. `./service.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files, never a `"use client"` component. See
 * `domains/curriculum/server.ts` / `domains/users/server.ts` for the same
 * pattern and why it exists.
 */
export {
  countProgressForItems,
  getDueReviewItems,
  getItemProgress,
  getLevelProgress,
  getNextUpcomingReviewAt,
  getUnlockedLevels,
  getUpcomingReviewForecast,
  getUserProgressForLanguage,
  hasItemProgress,
} from "./service";
export type { UpcomingReviewForecastItem } from "./repository";
