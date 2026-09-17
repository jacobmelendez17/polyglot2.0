import { FIXTURE_LEARNING_ITEMS } from "./curriculum-fixtures";
import type { LearningItem } from "./curriculum-types";

/**
 * Fixture-backed curriculum reads. **Test data only** as of spec 07 unit 6 —
 * the running lesson flow reads real curriculum rows through
 * `lesson-curriculum-repository.ts`, bound in `./server.ts`.
 *
 * Kept rather than deleted because it is what makes `domains/lessons`'
 * orchestration unit-testable without a database: `lesson-service.test.ts`
 * passes `fixtureCurriculumReader` in place of the real one. It excludes
 * nothing for already-learned items, which is correct for a fixture reader —
 * the real reader does that in SQL.
 */
export async function getEligibleLearningItems(
  userId: string,
  languageId: string,
): Promise<LearningItem[]> {
  void userId;
  return FIXTURE_LEARNING_ITEMS.filter(
    (item) => item.languageId === languageId,
  );
}

/** Fixture counterpart of the real by-ID read. Omits any ID not present in the fixture, never invents one. */
export async function getLearningItemsByIds(
  ids: string[],
): Promise<LearningItem[]> {
  const idSet = new Set(ids);
  return FIXTURE_LEARNING_ITEMS.filter((item) => idSet.has(item.id));
}

/**
 * The fixture set bundled as a `LessonCurriculumReader` (see that type's
 * docstring). Passed explicitly by tests; never used by the application.
 */
export const fixtureCurriculumReader = {
  getEligibleLearningItems,
  getLearningItemsByIds,
};
