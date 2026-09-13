/**
 * Client-safe public surface for `domains/users`: types and the pure,
 * database-free role helpers only. `resolveCurrentUser`/`requireUser` live
 * in `./server.ts` instead, since they transitively read Clerk's server
 * session and the database — see that file and `domains/lessons/server.ts`
 * for why the split exists. Safe to value-import from here in a
 * "use client" component.
 */
export { hasRole, requireRole } from "./role-helpers";
export { DEFAULT_CONTENT_PREFERENCES } from "./content-preferences";
export type { ContentPreferences } from "./content-preferences";
export { isOnboardingRequired } from "./onboarding";
export {
  CURRICULUM_MODES,
  isCurriculumChoiceRequired,
  isCurriculumMode,
  isThemeSelectionRequired,
} from "./curriculum-preference";
export type { CurriculumMode, LanguageSettings } from "./curriculum-preference";
export { getDefaultLanguageCode } from "./provisioning-config";
export { USER_ROLES } from "./user-types";
export type { PolyglotUser, UserRole } from "./user-types";
