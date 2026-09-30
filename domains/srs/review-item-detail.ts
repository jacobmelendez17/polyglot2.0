import { buildItemDetailView } from "@/domains/curriculum";
import type { ItemDetailView } from "@/domains/curriculum";
import { getItemDetailPageData } from "@/domains/curriculum/server";
import { ReviewError } from "@/lib/errors/review-errors";

import { verifyReviewState } from "./review-token";

/**
 * Spec 18's shared item presentation, scoped to the current review session
 * — the miss-feedback panel's equivalent of `getLessonItemDetail`. Not part
 * of `review-orchestration.ts`'s testable core: that module only imports
 * repository-tier, `DbClient`-injectable functions (see its own docstring)
 * specifically so an integration test can run it against one shared
 * transaction, and `domains/curriculum/server`'s composed read model reaches
 * the real singleton `db` directly. Fetched by the client in parallel with
 * the answer submission itself (see `review-session-view.tsx`), not chained
 * after it, so a miss shows its full item info without a second, visible
 * round trip.
 */

export type GetReviewItemDetailInput = {
  token: string;
  userId: string;
  languageId: string;
  itemId: string;
  now?: number;
};

export type ReviewItemDetail = {
  view: ItemDetailView;
  languageCode: string;
};

/**
 * Requires a valid review token naming `itemId` as one of the session's own
 * questions — the same shape of check `getLessonItemDetail` makes — so this
 * cannot be used to browse arbitrary items under a review token.
 */
export async function getReviewItemDetail({
  token,
  userId,
  languageId,
  itemId,
  now = Date.now(),
}: GetReviewItemDetailInput): Promise<ReviewItemDetail> {
  const state = await verifyReviewState({ token, userId, languageId, now });

  const belongsToSession = state.questions.some(
    (question) => question.itemId === itemId,
  );
  if (!belongsToSession) {
    throw new ReviewError("ITEM_NOT_FOUND");
  }

  const data = await getItemDetailPageData(itemId, userId);
  if (!data) {
    throw new ReviewError("ITEM_NOT_FOUND");
  }

  return {
    view: buildItemDetailView(data.source),
    languageCode: data.languageCode,
  };
}
