import { getLearningItemsByIds } from "@/domains/curriculum";
import { LessonError } from "@/lib/errors/lesson-errors";

import { verifyLessonState } from "./lesson-token";
import type { LessonCompletionPreview } from "./lesson-types";

const PREVIEW_STAGE_LABEL = "Beginner 1";

export type BuildLessonCompletionPreviewInput = {
  token: string;
  userId: string;
  languageId: string;
  now?: number;
};

/**
 * NOT real SRS enrollment. Spec 07 unit 6 — atomic Beginner-1 enrollment,
 * idempotency, and rate limiting (§43-§50) — is blocked: there is no
 * database and no `srs`/`progress` domain yet (see progress-tracker.md).
 * Standing up a throwaway enrollment implementation here would violate the
 * spec's explicit instruction not to fake unit 6 inside `domains/lessons`.
 *
 * What this *does* do, and does authoritatively: re-verify from the signed
 * lesson token alone that the comprehension quiz genuinely finished — every
 * required question satisfied, no pending retries, per §41's completion
 * rule — which needs no database at all. It then builds the results-screen
 * view model for spec 07 unit 7. Nothing is persisted here. Replace this
 * with real transactional enrollment through the `srs` domain once unit 6's
 * prerequisites exist.
 */
export async function buildLessonCompletionPreview({
  token,
  userId,
  languageId,
  now = Date.now(),
}: BuildLessonCompletionPreviewInput): Promise<LessonCompletionPreview> {
  const state = await verifyLessonState({ token, userId, languageId, now });

  if (state.phase !== "complete" || !state.quiz || state.quiz.queue.length > 0) {
    throw new LessonError("LESSON_STATE_INVALID");
  }

  const items = await getLearningItemsByIds(state.batch.map((batchItem) => batchItem.itemId));
  const orderedItems = state.batch
    .map((batchItem) => items.find((item) => item.id === batchItem.itemId))
    .filter((item): item is (typeof items)[number] => Boolean(item));

  const accuracy =
    state.quiz.attempts === 0 ? 100 : Math.round((state.quiz.correctAttempts / state.quiz.attempts) * 100);

  return {
    items: orderedItems.map((item) => ({
      id: item.id,
      label: item.type === "vocabulary" ? item.word : item.structure,
      meaning: item.type === "vocabulary" ? item.meanings[0] : item.meaning,
    })),
    newStage: PREVIEW_STAGE_LABEL,
    accuracy,
  };
}
