"use server";

import { z } from "zod";

import { requireUser } from "@/domains/users/server";
import { submitReviewAnswer } from "@/domains/srs/server";
import type { ReviewSessionResult } from "@/domains/srs";
import { AppError } from "@/lib/errors/app-error";
import { ReviewError } from "@/lib/errors/review-errors";

/**
 * Thin Server Action entry point (spec 09 §4, §7). Every payload is
 * validated with Zod, the action re-authenticates and re-resolves the
 * user's active language server-side — never trusting a client-supplied
 * `userId`/`languageId` — and all review rules are delegated to
 * `domains/srs`. This does not decide correctness, staleness, or
 * completion itself.
 *
 * `userId` throughout `domains/srs`/`domains/progress` is always the
 * *internal* Polyglot user id (`PolyglotUser.id`, the FK target of
 * `user_item_progress.user_id`) — never the raw Clerk user id. `requireUser()`
 * (spec 08's `domains/users`) resolves both identity and the real
 * `activeLanguageId` in one call.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function runReviewAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof ReviewError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "INVALID_REVIEW_STATE", message: "That request could not be understood." } };
    }
    // Never log the token, its decoded contents, or the learner's answer (spec 09 §20 Privacy and Logging).
    console.error("Unexpected review action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

const submitAnswerInputSchema = z.object({
  token: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string(),
  idempotencyKey: z.string().uuid(),
});

export async function submitReviewAnswerAction(
  input: z.infer<typeof submitAnswerInputSchema>,
): Promise<ActionResult<ReviewSessionResult>> {
  return runReviewAction(async () => {
    const { token, questionId, answer, idempotencyKey } = submitAnswerInputSchema.parse(input);
    const user = await requireUser();
    return submitReviewAnswer({
      token,
      userId: user.id,
      languageId: user.activeLanguageId,
      questionId,
      answer,
      idempotencyKey,
    });
  });
}
