import { FIXTURE_LEARNING_ITEMS } from "./curriculum-fixtures";
import type { LearningItem } from "./curriculum-types";

/**
 * Returns every currently eligible learning item for the user's active
 * language.
 *
 * Temporary implementation: always resolves the full fixture set, since
 * there is no `progress` domain yet to exclude already-learned items (see
 * progress-tracker.md Next Up #3/#4). The `Promise` return type mirrors the
 * eventual database-backed call so callers already await this correctly.
 * Ordering/priority is not applied here — that is `domains/lessons`'
 * responsibility (architecture.md: curriculum owns ordering data, lessons
 * owns lesson priority).
 */
export async function getEligibleLearningItems(
  userId: string,
  languageId: string,
): Promise<LearningItem[]> {
  void userId;
  return FIXTURE_LEARNING_ITEMS.filter((item) => item.languageId === languageId);
}

/**
 * Authoritatively loads full curriculum data for a known set of item IDs.
 * Callers must never treat client-supplied IDs as proof those items exist or
 * are eligible — this only returns items that are genuinely present in the
 * curriculum fixture, silently omitting any ID that is not.
 */
export async function getLearningItemsByIds(ids: string[]): Promise<LearningItem[]> {
  const idSet = new Set(ids);
  return FIXTURE_LEARNING_ITEMS.filter((item) => idSet.has(item.id));
}
