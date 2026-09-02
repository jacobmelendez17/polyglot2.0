/**
 * Server-only entry point for `domains/progress`. `./service.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files, never a `"use client"` component. See
 * `domains/curriculum/server.ts` / `domains/users/server.ts` for the same
 * pattern and why it exists.
 */
export {
  getDueReviewItems,
  getItemProgress,
  getLevelProgress,
  getUnlockedLevels,
  getUserProgressForLanguage,
  hasItemProgress,
} from "./service";
