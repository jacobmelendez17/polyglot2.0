import { db } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";
import { getRateLimiter } from "@/providers/rate-limit";

import * as resetService from "./reset-service";
import type { ResetContentTypeReviewsInput, ResetToLevelInput } from "./reset-service";
import type { ContentTypeResetResult } from "./reset-types";

/**
 * Binds the real `db`/rate limiter to `reset-service.ts`'s injectable
 * functions — the same split `domains/admin/admin-mutation-service.ts`
 * uses over `account-reset-service.ts`. `server.ts` exports from here, not
 * from `reset-service.ts` directly, so a real Server Action always goes
 * through the rate limit.
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
