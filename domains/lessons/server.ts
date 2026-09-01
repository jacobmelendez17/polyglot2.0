/**
 * Server-only entry point for `domains/lessons`. Every function here
 * transitively imports `lib/env.ts` (via `lesson-token.ts`), which reads
 * `CLERK_SECRET_KEY` and `LESSON_STATE_SECRET` — genuine server secrets.
 *
 * Import from here only in server-only files (Server Actions, route
 * handlers, Server Components) — `app/(focus)/lessons/actions.ts` and
 * `app/(focus)/lessons/page.tsx` are the only current callers. Client
 * components must import from `./index.ts` instead, which re-exports only
 * types and the secret-free config accessors. A client component that
 * value-imports anything from this file will bundle the secret-reading
 * code into the browser, even if it only references an unrelated named
 * export — discovered the hard way during this unit's browser
 * verification (see progress-tracker.md).
 */
export { openLessonItem, startLesson, startQuiz, submitQuizAnswer } from "./lesson-service";
export { buildLessonCompletionPreview } from "./lesson-completion-preview";
