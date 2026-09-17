import { db } from "@/db/client";
import { databaseCurriculumReader } from "@/domains/curriculum/server";
import { getLanguageSettings, resolveUserNow } from "@/domains/users/server";
import { getRateLimiter } from "@/providers/rate-limit";
import { LessonError } from "@/lib/errors/lesson-errors";

import { completeLesson as completeLessonTransaction } from "./lesson-completion";
import type {
  CompleteLessonInput,
  LessonCompletionResult,
} from "./lesson-completion";
import * as service from "./lesson-service";
import type {
  OpenLessonItemInput,
  StartLessonInput,
  StartQuizInput,
  SubmitQuizAnswerInput,
} from "./lesson-service";

/**
 * Binds the real curriculum reader, database, and rate limiter to
 * `domains/lessons`' injectable orchestration — the same split
 * `domains/admin/admin-mutation-service.ts` and `domains/srs/review-service.ts`
 * already use.
 *
 * Callers (`app/(focus)/lessons/*`) pass only their own inputs; the
 * curriculum source and the database are decided here and nowhere else.
 */

type WithoutCurriculum<T> = Omit<T, "curriculum">;

/**
 * Resolves the learner's curriculum preference here rather than in
 * `lesson-service.ts` — same split as the curriculum reader: the
 * orchestration stays database-free and unit-testable, and the one place
 * that knows about the database is this bindings module.
 */
export async function startLesson(
  input: WithoutCurriculum<StartLessonInput> & { settings?: undefined },
) {
  const settings = await getLanguageSettings(input.userId, input.languageId);
  return service.startLesson({
    ...input,
    settings,
    curriculum: databaseCurriculumReader,
  });
}

/** The themes the learner can pick from, for the curriculum preference screen and Settings. Read-only. */
export async function listAvailableThemes(input: {
  userId: string;
  languageId: string;
}) {
  return service.listAvailableThemes({
    ...input,
    curriculum: databaseCurriculumReader,
  });
}

export async function openLessonItem(input: OpenLessonItemInput) {
  return service.openLessonItem(input);
}

export async function startQuiz(input: WithoutCurriculum<StartQuizInput>) {
  return service.startQuiz({ ...input, curriculum: databaseCurriculumReader });
}

export async function submitQuizAnswer(
  input: WithoutCurriculum<SubmitQuizAnswerInput>,
) {
  return service.submitQuizAnswer({
    ...input,
    curriculum: databaseCurriculumReader,
  });
}

/**
 * Spec 07 §50 — lesson completion is a progress-affecting mutation, so it is
 * rate limited through the centralized provider before any work happens, and
 * **fails closed** (the `lesson-complete` policy sets `failOpen: false`, per
 * architecture.md's invariant 42). The check lives here rather than inside
 * `lesson-completion.ts` for the same reason it lives in every other
 * `*-service.ts`: the rate-limit provider is `server-only`-guarded and would
 * make the transaction module untestable against a rolled-back transaction.
 */
export async function completeLesson(
  input: WithoutCurriculum<CompleteLessonInput>,
): Promise<LessonCompletionResult> {
  const decision = await getRateLimiter().check({
    policy: "lesson-complete",
    subject: input.userId,
  });
  if (!decision.allowed) {
    throw new LessonError(
      "RATE_LIMITED",
      `Please slow down and try again in ${decision.retryAfterSeconds}s.`,
    );
  }
  // The sandbox clock applies to enrollment too: a persona simulating a
  // future date must have its `learnedAt` and first-review time land on that
  // date, or its schedule would immediately contradict its own perceived now.
  const now = input.now ?? (await resolveUserNow(db, input.userId));
  return completeLessonTransaction(db, {
    ...input,
    now,
    curriculum: databaseCurriculumReader,
  });
}
