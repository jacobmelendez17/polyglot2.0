/**
 * Server-only entry point for `domains/danger-zone`. `./binding.ts`
 * transitively imports `db/client.ts` — import from here only in
 * server-only files (Server Actions), never a `"use client"` component.
 * See `domains/users/server.ts` for why this split exists.
 */
export {
  cancelAccountDeletion,
  confirmAccountDeletion,
  finalizeDueAccountDeletions,
  getAccountDeletionStatus,
  getCurrentStreak,
  requestAccountDeletion,
  resetContentTypeReviews,
  resetDismissedWarnings,
  resetEntireAccount,
  resetToLevel,
  setManualStreak,
} from "./binding";
export type {
  ResetContentTypeReviewsInput,
  ResetToLevelInput,
} from "./reset-service";
export type {
  GetCurrentStreakInput,
  SetManualStreakInput,
} from "./streak-service";
export type { ResetDismissedWarningsInput } from "./notices-service";
export type { ResetEntireAccountInput } from "./account-reset-service";
export type {
  AccountDeletionStatus,
  CancelAccountDeletionInput,
  ConfirmAccountDeletionInput,
  RequestAccountDeletionInput,
} from "./account-deletion-service";
