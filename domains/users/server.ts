/**
 * Server-only entry point for `domains/users`. Every function here
 * transitively imports `db/client.ts` and Clerk's `auth()` — genuine
 * server-only concerns. Import from here only in server-only files (Server
 * Actions, route handlers, Server Components). A client component that
 * value-imports anything from this file will bundle the database client
 * into the browser, even if it only references an unrelated named export —
 * see `domains/lessons/server.ts`, where this was discovered the hard way.
 */
export {
  completeOnboarding,
  getEffectiveContentPreferences,
  getLanguageSettings,
  getUsersByIds,
  resolveCurrentUser,
  requireUser,
  setCurriculumPreference,
  updateAutoPronounceLessons,
  updateContentPreferences,
  updateGrammarPlacement,
  updateLessonBatchSize,
  updateName,
  updateTimezone,
  updateUsername,
} from "./user-service";
export { resolveUserNow } from "./user-clock";
export { disableVacationMode, enableVacationMode, isVacationModeActive } from "./vacation-service";
export type { VacationPeriod } from "./vacation-service";
