import { clerkClient } from "@clerk/nextjs/server";

import { db } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";
import { getRateLimiter } from "@/providers/rate-limit";
import type { RateLimitPolicyName } from "@/providers/rate-limit";

import * as accountDeletionService from "./account-deletion-service";
import type {
  AccountDeletionStatus,
  CancelAccountDeletionInput,
  ConfirmAccountDeletionInput,
  RequestAccountDeletionInput,
} from "./account-deletion-service";
import * as accountResetService from "./account-reset-service";
import type { ResetEntireAccountInput } from "./account-reset-service";
import * as noticesService from "./notices-service";
import type { ResetDismissedWarningsInput } from "./notices-service";
import * as resetService from "./reset-service";
import type {
  ResetContentTypeReviewsInput,
  ResetToLevelInput,
} from "./reset-service";
import type { ContentTypeResetResult } from "./reset-types";
import * as streakService from "./streak-service";
import type {
  GetCurrentStreakInput,
  SetManualStreakInput,
} from "./streak-service";

/**
 * Binds the real `db`/rate limiter to every `domains/danger-zone`
 * injectable core function (`reset-service.ts`, `streak-service.ts`,
 * `notices-service.ts`, `account-reset-service.ts`) — the same split
 * `domains/admin/admin-mutation-service.ts` uses over
 * `account-reset-service.ts`. `server.ts` exports from here, not from the
 * core service files directly, so a real Server Action always goes
 * through the rate limit.
 */
async function checkDangerZoneRateLimit(
  userId: string,
  policy: RateLimitPolicyName = "danger-zone-reset",
): Promise<void> {
  const decision = await getRateLimiter().check({ policy, subject: userId });
  if (!decision.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Please slow down and try again in ${decision.retryAfterSeconds}s.`,
    );
  }
}

export async function resetContentTypeReviews(
  input: ResetContentTypeReviewsInput,
): Promise<ContentTypeResetResult> {
  await checkDangerZoneRateLimit(input.userId);
  return resetService.resetContentTypeReviews(db, input);
}

export async function resetToLevel(
  input: ResetToLevelInput,
): Promise<ContentTypeResetResult> {
  await checkDangerZoneRateLimit(input.userId);
  return resetService.resetToLevel(db, input);
}

export async function setManualStreak(
  input: SetManualStreakInput,
): Promise<{ value: number }> {
  await checkDangerZoneRateLimit(input.userId);
  return streakService.setManualStreak(db, input);
}

/** Not rate-limited — a plain read, not a Danger Zone mutation. */
export async function getCurrentStreak(
  input: GetCurrentStreakInput,
): Promise<number> {
  return streakService.getCurrentStreak(db, input);
}

export async function resetDismissedWarnings(
  input: ResetDismissedWarningsInput,
): Promise<{ affectedItemCount: number }> {
  await checkDangerZoneRateLimit(input.userId);
  return noticesService.resetDismissedWarnings(db, input);
}

export async function resetEntireAccount(
  input: ResetEntireAccountInput,
): Promise<{ resetAt: string }> {
  await checkDangerZoneRateLimit(input.userId, "danger-zone-account-reset");
  return accountResetService.resetEntireAccount(db, input);
}

export async function requestAccountDeletion(
  input: RequestAccountDeletionInput,
): Promise<{ requestedAt: Date }> {
  await checkDangerZoneRateLimit(input.userId, "danger-zone-account-reset");
  return accountDeletionService.requestAccountDeletion(db, input);
}

export async function confirmAccountDeletion(
  input: ConfirmAccountDeletionInput,
): Promise<{ deleteAfter: Date }> {
  await checkDangerZoneRateLimit(input.userId, "danger-zone-account-reset");
  return accountDeletionService.confirmAccountDeletion(db, input);
}

export async function cancelAccountDeletion(
  input: CancelAccountDeletionInput,
): Promise<{ cancelled: boolean }> {
  await checkDangerZoneRateLimit(input.userId, "danger-zone-account-reset");
  return accountDeletionService.cancelAccountDeletion(db, input);
}

/** Not rate-limited — a plain read, not a Danger Zone mutation. */
export async function getAccountDeletionStatus(
  userId: string,
): Promise<AccountDeletionStatus> {
  return accountDeletionService.getAccountDeletionStatus(db, userId);
}

/** Duck-typed rather than importing Clerk's type guard: the backend SDK's error shape (`.status`) is stable across the client/server packages, and this avoids depending on an import path this codebase doesn't otherwise use. */
function isClerkUserNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: unknown }).status === 404
  );
}

/**
 * Binds the real Clerk backend client for the Vercel Cron finalize job
 * (spec 20 "Permanent Account Deletion") — the one Danger Zone operation
 * with no single authenticated `userId` to rate-limit, since it processes
 * every due request across every account. `app/api/cron/.../route.ts` is
 * the only caller, itself protected by `CRON_SECRET`, not this rate
 * limiter.
 */
export async function finalizeDueAccountDeletions(
  now: Date,
): Promise<{ processedCount: number; failedCount: number }> {
  const client = await clerkClient();
  return accountDeletionService.finalizeDueAccountDeletions(db, {
    now,
    deleteClerkUser: async (clerkUserId) => {
      if (!clerkUserId) return;
      try {
        await client.users.deleteUser(clerkUserId);
      } catch (error) {
        if (isClerkUserNotFoundError(error)) return;
        throw error;
      }
    },
  });
}
