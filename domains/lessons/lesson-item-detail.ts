import { buildItemDetailView } from "@/domains/curriculum";
import type { ItemDetailView } from "@/domains/curriculum";
import { getItemDetailPageData } from "@/domains/curriculum/server";
import { LessonError } from "@/lib/errors/lesson-errors";

import { verifyLessonState } from "./lesson-token";

/**
 * The study screen's equivalent of `getItemDetailPageData` for the item
 * page — spec 18's shared presentation, scoped to the current lesson
 * session rather than to a level. Not part of `lesson-service.ts`'s pure
 * core: it calls `domains/curriculum/server`'s real, database-backed read
 * model directly, which is exactly what that core's injected
 * `LessonCurriculumReader` port exists to keep out (see that port's
 * docstring) — so this lives in its own server-only module instead.
 */

export type GetLessonItemDetailInput = {
  token: string;
  userId: string;
  languageId: string;
  itemId: string;
  now?: number;
};

export type LessonItemDetail = {
  view: ItemDetailView;
  languageCode: string;
};

/**
 * Requires a valid lesson token naming `itemId` as one of the session's own
 * batch items — the same check `openLessonItem` makes — so this cannot be
 * used to browse arbitrary items under the guise of a lesson token.
 */
export async function getLessonItemDetail({
  token,
  userId,
  languageId,
  itemId,
  now = Date.now(),
}: GetLessonItemDetailInput): Promise<LessonItemDetail> {
  const state = await verifyLessonState({ token, userId, languageId, now });

  const belongsToBatch = state.batch.some(
    (batchItem) => batchItem.itemId === itemId,
  );
  if (!belongsToBatch) {
    throw new LessonError("ITEM_NOT_FOUND");
  }

  const data = await getItemDetailPageData(itemId, userId);
  if (!data) {
    throw new LessonError("ITEM_NOT_FOUND");
  }

  return {
    view: buildItemDetailView(data.source),
    languageCode: data.languageCode,
  };
}
