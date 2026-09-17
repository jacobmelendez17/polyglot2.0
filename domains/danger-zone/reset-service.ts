import type { DbClient } from "@/db/client";
import { getLevelsByLanguage } from "@/domains/curriculum/curriculum-repository";
import { withIdempotency } from "@/domains/idempotency";
import {
  deleteItemProgressByIds,
  deleteLevelUnlocksAboveLevel,
  getItemProgressAboveLevel,
  getResetCandidateItems,
  getUnlockedLevels,
  resetItemProgressToBeginner,
} from "@/domains/progress/repository";
import { calculateLeechStatus } from "@/domains/srs";
import type { ReviewItemType } from "@/domains/srs";
import {
  deleteGhostProgressForContentType,
  deleteGhostProgressForLearningItems,
} from "@/domains/srs/ghost-repository";
import { findReviewPreferences } from "@/domains/srs/review-preference-repository";
import { AppError } from "@/lib/errors/app-error";

import { isCefrLevel } from "./reset-types";
import type { ContentTypeResetResult, ResetTarget } from "./reset-types";

/**
 * Injectable core logic (spec 20 Danger Zone) — takes a `DbClient`, not the
 * `db` singleton, matching `domains/admin/account-reset-service.ts`'s own
 * split between an injectable, directly-testable core and a thin binding
 * layer (`./reset-binding.ts`) that adds the rate limit and the real `db`
 * for production callers. Every Danger Zone reset is idempotency-wrapped
 * (spec's own "Danger Zone operations should use... idempotency...
 * transactions where multiple records are affected").
 */

export type ResetContentTypeReviewsInput = {
  userId: string;
  languageId: string;
  contentType: ReviewItemType;
  target: ResetTarget;
  idempotencyKey: string;
  now?: Date;
};

/**
 * Spec 20 Danger Zone — "Reset Grammar"/"Reset Vocabulary" both call this
 * one service; `contentType` is the only thing that differs between the
 * two dropdowns ("use the same underlying reset service with item-type
 * filters... do not implement separate unrelated reset logic for
 * vocabulary and grammar").
 *
 * `target: "ghost"` takes a completely different path (delete Ghost rows,
 * never touch normal SRS state) — every other target (`main`, `leech`, a
 * CEFR band) shares the same "reset candidate items to Beginner 1" step,
 * differing only in which items qualify as candidates.
 */
export async function resetContentTypeReviews(
  db: DbClient,
  input: ResetContentTypeReviewsInput,
): Promise<ContentTypeResetResult> {
  const now = input.now ?? new Date();

  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "danger-zone.reset-reviews",
      key: input.idempotencyKey,
      payload: {
        languageId: input.languageId,
        contentType: input.contentType,
        target: input.target,
      },
    },
    async (tx) => {
      if (input.target === "ghost") {
        const affectedItemCount = await deleteGhostProgressForContentType(
          tx,
          input.userId,
          input.languageId,
          input.contentType,
        );
        return { affectedItemCount };
      }

      const cefrLevel = isCefrLevel(input.target) ? input.target : undefined;
      const candidates = await getResetCandidateItems(
        tx,
        input.userId,
        input.languageId,
        input.contentType,
        cefrLevel,
      );

      let targets = candidates;
      if (input.target === "leech") {
        const preferences = await findReviewPreferences(
          tx,
          input.userId,
          input.languageId,
        );
        const minimumLeechStage =
          input.contentType === "grammar"
            ? preferences.grammarMinimumLeechStage
            : preferences.vocabularyMinimumLeechStage;
        targets = candidates.filter((item) =>
          calculateLeechStatus({
            incorrectCount: item.incorrectCount,
            currentCorrectStreak: item.currentCorrectStreak,
            highestSrsStageReached: item.highestSrsStageReached,
            minimumLeechStage,
          }),
        );
      }

      if (targets.length === 0) return { affectedItemCount: 0 };

      await resetItemProgressToBeginner(tx, {
        userId: input.userId,
        items: targets.map((item) => ({
          learningItemId: item.learningItemId,
          levelNumber: item.levelNumber,
        })),
        now,
      });
      return { affectedItemCount: targets.length };
    },
  );
}

export type ResetToLevelInput = {
  userId: string;
  languageId: string;
  targetLevelNumber: number;
  idempotencyKey: string;
};

/**
 * Spec 20 Danger Zone — Reset to Level. Rejects a target that isn't an
 * already-unlocked, strictly-earlier Level server-side — "server-side
 * confirmation remains authoritative," so the dropdown's own "never offer
 * a future locked Level"/no-op-disabling behavior is enforced again here,
 * not trusted from the client.
 */
export async function resetToLevel(
  db: DbClient,
  input: ResetToLevelInput,
): Promise<ContentTypeResetResult> {
  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "danger-zone.reset-to-level",
      key: input.idempotencyKey,
      payload: {
        languageId: input.languageId,
        targetLevelNumber: input.targetLevelNumber,
      },
    },
    async (tx) => {
      const [allLevels, unlockedLevels] = await Promise.all([
        getLevelsByLanguage(tx, input.languageId),
        getUnlockedLevels(tx, input.userId, input.languageId),
      ]);
      const levelNumberById = new Map(
        allLevels.map((level) => [level.id, level.levelNumber]),
      );
      const unlockedLevelNumbers = unlockedLevels
        .map((progress) => levelNumberById.get(progress.levelId))
        .filter(
          (levelNumber): levelNumber is number => levelNumber !== undefined,
        );
      const currentLevelNumber =
        unlockedLevelNumbers.length > 0 ? Math.max(...unlockedLevelNumbers) : 1;

      if (
        !unlockedLevelNumbers.includes(input.targetLevelNumber) ||
        input.targetLevelNumber >= currentLevelNumber
      ) {
        throw new AppError(
          "RESET_TARGET_INVALID",
          "Choose an earlier, already-unlocked Level to reset to.",
        );
      }

      const itemsAbove = await getItemProgressAboveLevel(
        tx,
        input.userId,
        input.languageId,
        input.targetLevelNumber,
      );
      const itemIdsAbove = itemsAbove.map((item) => item.learningItemId);

      if (itemIdsAbove.length > 0) {
        // Ghost state first — it references the progress row being removed next, not the other way around.
        await deleteGhostProgressForLearningItems(
          tx,
          input.userId,
          itemIdsAbove,
        );
        await deleteItemProgressByIds(tx, input.userId, itemIdsAbove);
      }
      await deleteLevelUnlocksAboveLevel(
        tx,
        input.userId,
        input.languageId,
        input.targetLevelNumber,
      );

      return { affectedItemCount: itemIdsAbove.length };
    },
  );
}
