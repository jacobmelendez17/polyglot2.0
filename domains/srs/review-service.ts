import { db } from "@/db/client";
import { getRateLimiter } from "@/providers/rate-limit";
import { ReviewError } from "@/lib/errors/review-errors";

import * as orchestration from "./review-orchestration";
import * as repository from "./review-repository";
import type { GetReviewHistoryInput, InsertReviewEventInput } from "./review-history-types";
import type { StartReviewSessionInput, SubmitReviewAnswerInput } from "./review-orchestration";

/**
 * Binds the real app database to the injectable review repository/
 * orchestration functions — see `domains/progress/service.ts` for the same
 * pattern. Not guarded with `import "server-only"` directly — importing
 * `db` from `db/client.ts` already carries that guard transitively (as does
 * `providers/rate-limit`, imported below).
 */

export async function insertReviewEvent(input: InsertReviewEventInput) {
  return repository.insertReviewEvent(db, input);
}

export async function getReviewHistory(input: GetReviewHistoryInput) {
  return repository.getReviewHistory(db, input);
}

export async function startReviewSession(input: StartReviewSessionInput) {
  return orchestration.startReviewSession(db, input);
}

/**
 * Spec 09 §13: every authoritative review submission is rate limited before
 * any database work happens. Enforced here, not inside
 * `review-orchestration.ts`, because the rate-limit provider is
 * server-only-guarded and that module must stay plain-`DbClient`-testable
 * (see `review-orchestration.ts`'s own docstring on why).
 */
export async function submitReviewAnswer(input: SubmitReviewAnswerInput) {
  const decision = await getRateLimiter().check({ policy: "review-submit", subject: input.userId });
  if (!decision.allowed) {
    throw new ReviewError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  return orchestration.submitReviewAnswer(db, input);
}
