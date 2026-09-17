import type { LearningItem } from "@/domains/curriculum";

/**
 * The curriculum capability `domains/lessons` requires, expressed as a port
 * rather than a direct import (architecture.md's dependency rule: lessons
 * depends on curriculum, but on its behavior, not its storage).
 *
 * Two implementations exist:
 *
 * - the database-backed one bound in `domains/curriculum/server.ts`, used by
 *   the real lesson flow;
 * - the fixture-backed one in `domains/curriculum/curriculum-service.ts`,
 *   used by `lesson-service.test.ts`.
 *
 * This split is what lets the orchestration in `lesson-service.ts` stay a
 * fast, database-free unit test while the running application reads real
 * curriculum rows. Injecting the reader is deliberate: without it,
 * `lesson-service.ts` would transitively import `db/client.ts`, whose
 * `server-only` guard throws under Vitest regardless of which export is used
 * (see progress-tracker.md's Architecture Decisions).
 */
export type LessonCurriculumReader = {
  /** Published items in the language that the user has not already enrolled. */
  getEligibleLearningItems(
    userId: string,
    languageId: string,
  ): Promise<LearningItem[]>;
  /** Authoritative content for known IDs. Unresolvable or unpublished IDs are omitted, never invented. */
  getLearningItemsByIds(ids: string[]): Promise<LearningItem[]>;
};
