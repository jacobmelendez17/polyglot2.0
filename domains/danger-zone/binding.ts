import { db } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";
import { getRateLimiter } from "@/providers/rate-limit";

import * as noticesService from "./notices-service";
import type { ResetDismissedWarningsInput } from "./notices-service";
import * as resetService from "./reset-service";
import type { ResetContentTypeReviewsInput, ResetToLevelInput } from "./reset-service";
import type { ContentTypeResetResult } from "./reset-types";
import * as streakService from "./streak-service";
import type { GetCurrentStreakInput, SetManualStreakInput } from "./streak-service";

/**
 * Binds the real `db`/rate limiter to every `domains/danger-zone`
 * injectable core function (`reset-service.ts`, `streak-service.ts`,
 * `notices-service.ts`) — the same split `domains/admin/
 * admin-mutation-service.ts` uses over `account-reset-service.ts`.
 * `server.ts` exports from here, not from the core service files
 * directly, so a real Server Action always goes through the rate limit.
 */
async function checkDangerZoneRateLimit(userId: string): Promise<void> {
  const decision = await getRateLimiter().check({ policy: "danger-zone-reset", subject: userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
}

export async function resetContentTypeReviews(input: ResetContentTypeReviewsInput): Promise<ContentTypeResetResult> {
  await checkDangerZoneRateLimit(input.userId);
  return resetService.resetContentTypeReviews(db, input);
}

export async function resetToLevel(input: ResetToLevelInput): Promise<ContentTypeResetResult> {
  await checkDangerZoneRateLimit(input.userId);
  return resetService.resetToLevel(db, input);
}

export async function setManualStreak(input: SetManualStreakInput): Promise<{ value: number }> {
  await checkDangerZoneRateLimit(input.userId);
  return streakService.setManualStreak(db, input);
}

/** Not rate-limited — a plain read, not a Danger Zone mutation. */
export async function getCurrentStreak(input: GetCurrentStreakInput): Promise<number> {
  return streakService.getCurrentStreak(db, input);
}

export async function resetDismissedWarnings(input: ResetDismissedWarningsInput): Promise<{ affectedItemCount: number }> {
  await checkDangerZoneRateLimit(input.userId);
  return noticesService.resetDismissedWarnings(db, input);
}
