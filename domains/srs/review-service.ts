import { db } from "@/db/client";
import { resolveUserNow } from "@/domains/users/server";
import { getRateLimiter } from "@/providers/rate-limit";
import { AppError } from "@/lib/errors/app-error";
import { ReviewError } from "@/lib/errors/review-errors";

import * as orchestration from "./review-orchestration";
import * as preferenceRepository from "./review-preference-repository";
import * as repository from "./review-repository";
import type { GetReviewHistoryInput, InsertReviewEventInput } from "./review-history-types";
import type { StartReviewSessionInput, SubmitReviewAnswerInput } from "./review-orchestration";
import type { ReviewType } from "./review-preference";

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

export async function getReviewTimestampsInWindow(userId: string, languageId: string, window: { since: Date; until: Date }) {
  return repository.getReviewTimestampsInWindow(db, userId, languageId, window);
}

/**
 * Resolves the caller's perceived `now` before any due-review work (spec 11's
 * sandbox clock). Identical to real server time for every ordinary learner;
 * only a sandbox persona can carry an offset. An explicit `now` from the
 * caller still wins, which is what keeps the orchestration tests
 * deterministic.
 */
export async function startReviewSession(input: StartReviewSessionInput) {
  const now = input.now ?? (await resolveUserNow(db, input.userId)).getTime();
  return orchestration.startReviewSession(db, { ...input, now });
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
  const now = input.now ?? (await resolveUserNow(db, input.userId)).getTime();
  return orchestration.submitReviewAnswer(db, { ...input, now });
}

/** This learner's Review Type preferences for one language, or the centralized defaults (spec 20 Reviews). */
export async function getReviewPreferences(userId: string, languageId: string) {
  return preferenceRepository.findReviewPreferences(db, userId, languageId);
}

/** Spec 20 Reviews — Grammar Review Type. Ordinary "account-settings" rate limit, matching every other narrow Settings field save. */
export async function updateGrammarReviewType(input: { userId: string; languageId: string; reviewType: ReviewType }) {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  return preferenceRepository.saveGrammarReviewType(db, input);
}

/** Spec 20 Reviews — Vocabulary Review Type. Ordinary "account-settings" rate limit, matching every other narrow Settings field save. */
export async function updateVocabularyReviewType(input: { userId: string; languageId: string; reviewType: ReviewType }) {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: input.userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  return preferenceRepository.saveVocabularyReviewType(db, input);
}
