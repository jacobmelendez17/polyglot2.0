"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { FIXTURE_LANGUAGE_ID } from "@/domains/curriculum";
import {
  buildLessonCompletionPreview,
  openLessonItem,
  startLesson,
  startQuiz,
  submitQuizAnswer,
} from "@/domains/lessons/server";
import type { LessonCompletionPreview, LessonSessionResult, LessonStartResult } from "@/domains/lessons";
import { LessonError } from "@/lib/errors/lesson-errors";

/**
 * Thin Server Action entry points (spec 07 §62): every payload is validated
 * with Zod, every action re-authenticates, and all learning rules are
 * delegated to `domains/lessons`/`domains/curriculum`. None of these
 * functions decide eligibility, correctness, or completion themselves.
 *
 * `languageId` stands in for the user's active language. The `users`
 * domain and persisted language selection don't exist yet
 * (progress-tracker.md Next Up #3), so every action uses the fixture
 * curriculum's language until that plumbing exists — same limitation the
 * dashboard already has for the greeting name.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new LessonError("UNAUTHENTICATED");
  return userId;
}

async function runLessonAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof LessonError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: { code: "LESSON_STATE_INVALID", message: "That request could not be understood." } };
    }
    // Never log the token, its decoded contents, or the learner's answer (spec 07 §7 Observability).
    console.error("Unexpected lesson action error", error);
    return { ok: false, error: { code: "UNKNOWN", message: "Something went wrong. Please try again." } };
  }
}

export async function startLessonAction(): Promise<ActionResult<LessonStartResult>> {
  return runLessonAction(async () => {
    const userId = await requireUserId();
    return startLesson({ userId, languageId: FIXTURE_LANGUAGE_ID });
  });
}

const openItemInputSchema = z.object({ token: z.string().min(1), itemId: z.string().min(1) });

export async function openLessonItemAction(
  input: z.infer<typeof openItemInputSchema>,
): Promise<ActionResult<{ token: string; viewedItemIds: string[] }>> {
  return runLessonAction(async () => {
    const { token, itemId } = openItemInputSchema.parse(input);
    const userId = await requireUserId();
    const result = await openLessonItem({ token, userId, languageId: FIXTURE_LANGUAGE_ID, itemId });
    return { token: result.token, viewedItemIds: result.viewedItemIds };
  });
}

const tokenInputSchema = z.object({ token: z.string().min(1) });

export async function startQuizAction(
  input: z.infer<typeof tokenInputSchema>,
): Promise<ActionResult<LessonSessionResult>> {
  return runLessonAction(async () => {
    const { token } = tokenInputSchema.parse(input);
    const userId = await requireUserId();
    return startQuiz({ token, userId, languageId: FIXTURE_LANGUAGE_ID });
  });
}

const submitAnswerInputSchema = z.object({
  token: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string(),
});

export async function submitQuizAnswerAction(
  input: z.infer<typeof submitAnswerInputSchema>,
): Promise<ActionResult<LessonSessionResult>> {
  return runLessonAction(async () => {
    const { token, questionId, answer } = submitAnswerInputSchema.parse(input);
    const userId = await requireUserId();
    return submitQuizAnswer({ token, userId, languageId: FIXTURE_LANGUAGE_ID, questionId, answer });
  });
}

export async function completeLessonAction(
  input: z.infer<typeof tokenInputSchema>,
): Promise<ActionResult<LessonCompletionPreview>> {
  return runLessonAction(async () => {
    const { token } = tokenInputSchema.parse(input);
    const userId = await requireUserId();
    return buildLessonCompletionPreview({ token, userId, languageId: FIXTURE_LANGUAGE_ID });
  });
}
