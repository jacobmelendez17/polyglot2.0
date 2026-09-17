import { getStageIndex } from "./srs-rules";
import type { SrsStage } from "./srs-types";

export type CalculateLeechStatusInput = {
  /** Lifetime incorrect normal-SRS outcomes for this item (`user_item_progress.incorrectCount`) — Ghost Reviews never contribute. */
  incorrectCount: number;
  /** Consecutive normal-SRS correct results for this item (`user_item_progress.currentCorrectStreak`). */
  currentCorrectStreak: number;
  /** The highest normal SRS stage this item has ever reached (`user_item_progress.highestSrsStageReached`) — never the item's current stage. */
  highestSrsStageReached: SrsStage;
  /** This learner's configured Minimum SRS for Leech, for this item's content type. */
  minimumLeechStage: SrsStage;
};

/**
 * Spec 20 Leeches — the one authoritative Leech-status formula ("Leech
 * Classification": "Do not reimplement the formula in React"). Leech status
 * is always derived, never a stored boolean, so this is the single place it
 * gets computed.
 *
 * `leechScore = incorrectCount / max(currentCorrectStreak, 1) ^ 1.5`, a
 * Leech when that score is strictly greater than 1 *and* the item has
 * satisfied its configured minimum-SRS requirement at least once — checked
 * against `highestSrsStageReached`, not the current stage, so an item that
 * reached Master and later fell to Beginner 4 still qualifies against a
 * Familiar-1 minimum (spec's own worked example).
 */
export function calculateLeechStatus(
  input: CalculateLeechStatusInput,
): boolean {
  const effectiveCorrectStreak = Math.max(input.currentCorrectStreak, 1);
  const leechScore = input.incorrectCount / effectiveCorrectStreak ** 1.5;
  const satisfiesMinimumStage =
    getStageIndex(input.highestSrsStageReached) >=
    getStageIndex(input.minimumLeechStage);
  return leechScore > 1 && satisfiesMinimumStage;
}
