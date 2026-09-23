"use server";

import { z } from "zod";

/**
 * Same permissive UUID-shape reasoning as `domains/admin/audit-schemas.ts`
 * — this codebase's seeded fixture IDs (e.g. `vocabulary_groups` rows like
 * `30000000-0000-0000-0000-000000000001`) don't satisfy `z.uuid()`'s
 * stricter RFC 4122 version check, which rejects them outright. Confirmed
 * live 2026-09-23: a real learner's Theme-mode "Start lesson" against a
 * real seeded group id failed with "That request could not be understood"
 * — `chooseThemeInputSchema`'s `themeId` (a `vocabulary_groups.id`) was the
 * one `z.string().uuid()` in this file that was never switched to this
 * already-established pattern.
 */
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );

import {
  completeLesson,
  openLessonItem,
  startQuiz,
  submitQuizAnswer,
} from "@/domains/lessons/server";
import type { LessonSessionResult } from "@/domains/lessons";
import type { LessonCompletionResult } from "@/domains/lessons/server";
import { listAvailableThemes } from "@/domains/lessons/server";
import { requireUser, setCurriculumPreference } from "@/domains/users/server";
import { AppError } from "@/lib/errors/app-error";
import { LessonError } from "@/lib/errors/lesson-errors";

/**
 * Thin Server Action entry points (spec 07 §62): every payload is validated
 * with Zod, every action re-authenticates, and all learning rules are
 * delegated to `domains/lessons`/`domains/curriculum`. None of these
 * functions decide eligibility, correctness, or completion themselves.
 *
 * Identity is resolved through `domains/users`' `requireUser()` — the
 * internal Polyglot UUID and the user's own `activeLanguageId`, not Clerk's
 * raw id and not a fixture constant. That distinction is load-bearing as of
 * spec 07 unit 6: these values are written into `user_item_progress`, whose
 * foreign keys require real `users`/`learning_items`/`languages` rows.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** The authenticated learner plus the language they are actually studying. */
async function requireLearner(): Promise<{
  userId: string;
  languageId: string;
}> {
  const user = await requireUser();
  return { userId: user.id, languageId: user.activeLanguageId };
}

async function runLessonAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof LessonError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "LESSON_STATE_INVALID",
          message: "That request could not be understood.",
        },
      };
    }
    // Never log the token, its decoded contents, or the learner's answer (spec 07 §7 Observability).
    console.error("Unexpected lesson action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

const openItemInputSchema = z.object({
  token: z.string().min(1),
  itemId: z.string().min(1),
});

export async function openLessonItemAction(
  input: z.infer<typeof openItemInputSchema>,
): Promise<ActionResult<{ token: string; viewedItemIds: string[] }>> {
  return runLessonAction(async () => {
    const { token, itemId } = openItemInputSchema.parse(input);
    const { userId, languageId } = await requireLearner();
    const result = await openLessonItem({ token, userId, languageId, itemId });
    return { token: result.token, viewedItemIds: result.viewedItemIds };
  });
}

const tokenInputSchema = z.object({ token: z.string().min(1) });

export async function startQuizAction(
  input: z.infer<typeof tokenInputSchema>,
): Promise<ActionResult<LessonSessionResult>> {
  return runLessonAction(async () => {
    const { token } = tokenInputSchema.parse(input);
    const { userId, languageId } = await requireLearner();
    return startQuiz({ token, userId, languageId });
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
    const { userId, languageId } = await requireLearner();
    return submitQuizAnswer({ token, userId, languageId, questionId, answer });
  });
}

/**
 * Spec 07 §43/§49 — the real completion request. The client generates one
 * idempotency key per logical completion and **reuses it verbatim on retry**;
 * a replay with the same key returns the original result instead of enrolling
 * the batch a second time, and a reused key carrying a different batch is
 * rejected outright.
 */
const completeLessonInputSchema = z.object({
  token: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

export async function completeLessonAction(
  input: z.infer<typeof completeLessonInputSchema>,
): Promise<ActionResult<LessonCompletionResult>> {
  return runLessonAction(async () => {
    const { token, idempotencyKey } = completeLessonInputSchema.parse(input);
    const { userId, languageId } = await requireLearner();
    return completeLesson({ token, userId, languageId, idempotencyKey });
  });
}

const chooseThemeInputSchema = z.object({ themeId: uuidLike });

/**
 * Spec 16 — the Theme-mode learner picking which theme to study next, from
 * the lesson screen itself.
 *
 * Writes the same settings row the preference screen does, through the same
 * service, so there is one place a theme is stored and one set of rules
 * around it. The theme is re-validated against what this learner can
 * actually study rather than trusted: a group id is a request.
 *
 * Deliberately not a lesson mutation — it starts no session, signs no token,
 * and touches no progress. It only records a preference; the batch is built
 * on the next render, server-side, as always.
 */
export async function chooseLessonThemeAction(
  input: z.infer<typeof chooseThemeInputSchema>,
): Promise<ActionResult<null>> {
  try {
    const { themeId } = chooseThemeInputSchema.parse(input);
    const user = await requireUser();

    if (user.isSandbox) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Sandbox previews don't change your preference.",
        },
      };
    }

    const themes = await listAvailableThemes({
      userId: user.id,
      languageId: user.activeLanguageId,
    });
    if (!themes.some((theme) => theme.id === themeId)) {
      return {
        ok: false,
        error: {
          code: "THEME_UNAVAILABLE",
          message: "That theme isn't available to study right now.",
        },
      };
    }

    await setCurriculumPreference({
      userId: user.id,
      languageId: user.activeLanguageId,
      curriculumMode: "choose_group",
      selectedVocabularyGroupId: themeId,
    });
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "LESSON_STATE_INVALID",
          message: "That request could not be understood.",
        },
      };
    }
    console.error("Unexpected lesson theme action error", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}
