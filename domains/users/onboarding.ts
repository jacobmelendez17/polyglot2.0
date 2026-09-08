import type { PolyglotUser } from "./user-types";

/**
 * Pure, database-free onboarding routing rule (spec 15). Kept out of
 * `user-repository.ts` and out of the layouts that call it so there is
 * exactly one answer to "does this user need onboarding?", and so that
 * answer is unit-testable without a database.
 *
 * Two users are deliberately exempt:
 *
 * - **Sandbox personas.** A persona is a real `users` row with no Clerk
 *   identity, created on demand by an admin. Routing one into onboarding
 *   would trap "Open Sandbox" on a welcome tour instead of the learner
 *   experience the admin opened it to inspect — and its completion state is
 *   meaningless, since the persona is a testing fixture, not a learner.
 * - **Anyone already completed.** `onboardingCompletedAt` is a timestamp, so
 *   "completed" is simply "not null"; the value itself is never compared
 *   against a version or a date window. Onboarding is shown once.
 */
export function isOnboardingRequired(user: Pick<PolyglotUser, "isSandbox" | "onboardingCompletedAt">): boolean {
  if (user.isSandbox) return false;
  return user.onboardingCompletedAt === null;
}
