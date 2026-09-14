import type { GhostMode } from "./review-preference";

const MS_PER_HOUR = 60 * 60 * 1000;

export const GHOST_STAGES = ["ghost_1", "ghost_2", "ghost_3", "ghost_4"] as const;
export type GhostStage = (typeof GHOST_STAGES)[number];

/**
 * Spec 20 Ghost Reviews' "Ghost SRS" — the Ghost SRS's own fixed schedule,
 * entirely independent of SRS Interval mode or the normal SRS's stage
 * intervals. Read as "the interval used to schedule *this* stage as the
 * next due Ghost review" (the spec's own diagram: "Ghost created -> 4 hours
 * -> Ghost 1 review -> correct -> 12 hours -> Ghost 2 review -> ...").
 */
export const GHOST_INTERVAL_HOURS: Record<GhostStage, number> = {
  ghost_1: 4,
  ghost_2: 12,
  ghost_3: 24,
  ghost_4: 48,
};

function scheduleGhostStage(stage: GhostStage, now: Date): Date {
  return new Date(now.getTime() + GHOST_INTERVAL_HOURS[stage] * MS_PER_HOUR);
}

/**
 * The freshly-activated Ghost's first schedule — used both when a Ghost is
 * created outright (Ghost Review — On) or activates after a second miss
 * (Ghost Review — Minimal), and again for "Incorrect Ghost Answer" ("reset
 * Ghost to Ghost 1... schedule the next Ghost review for 4 hours") — all
 * three are the identical Ghost-1 schedule, not three separate rules.
 */
export function activateGhost(now: Date): { ghostStage: GhostStage; nextReviewAt: Date } {
  return { ghostStage: "ghost_1", nextReviewAt: scheduleGhostStage("ghost_1", now) };
}

export type GhostAnswerResult =
  | { kind: "advanced"; ghostStage: GhostStage; nextReviewAt: Date }
  | { kind: "completed" }
  | { kind: "reset"; ghostStage: GhostStage; nextReviewAt: Date };

/**
 * Spec 20 Ghost Reviews — grading a Ghost review itself (never the normal
 * item's SRS: "Do not apply another normal SRS penalty... Normal and Ghost
 * SRS must remain separate"). Correct advances one Ghost stage, or
 * completes the Ghost outright past Ghost 4 ("Ghost is gone"); incorrect
 * always resets to Ghost 1, regardless of which stage it was on.
 */
export function calculateGhostAnswerResult(currentStage: GhostStage, isCorrect: boolean, now: Date): GhostAnswerResult {
  if (!isCorrect) {
    return { kind: "reset", ...activateGhost(now) };
  }
  const nextStage = GHOST_STAGES[GHOST_STAGES.indexOf(currentStage) + 1];
  if (!nextStage) return { kind: "completed" };
  return { kind: "advanced", ghostStage: nextStage, nextReviewAt: scheduleGhostStage(nextStage, now) };
}

export type GhostMissOutcome =
  | { kind: "no_op" }
  | { kind: "record_miss"; missCount: number }
  | { kind: "activate"; missCount: number; ghostStage: GhostStage; nextReviewAt: Date };

/**
 * Spec 20 Ghost Reviews — what one incorrect *normal* review (of a
 * Cloze-presented, sentence-bearing question) does to that sentence's Ghost
 * state, given the mode currently configured for this content type and the
 * sentence's existing Ghost row (if any).
 *
 * An already-active Ghost (`existingGhostStage` non-null) is a deliberate
 * `no_op` — once a Ghost exists for a sentence, only answering *that* Ghost
 * review (`calculateGhostAnswerResult`) changes it; a further normal-review
 * miss of the same sentence doesn't reinforce or reset it.
 */
export function calculateGhostMissOutcome(input: {
  mode: GhostMode;
  existingMissCount: number;
  existingGhostStage: GhostStage | null;
  now: Date;
}): GhostMissOutcome {
  if (input.mode === "off") return { kind: "no_op" };
  if (input.existingGhostStage !== null) return { kind: "no_op" };

  const missCount = input.existingMissCount + 1;
  // "On": any miss activates. "Minimal": the same sentence must be missed
  // more than once — activate exactly when this miss brings the count to 2+.
  if (input.mode === "on" || missCount >= 2) {
    return { kind: "activate", missCount, ...activateGhost(input.now) };
  }
  return { kind: "record_miss", missCount };
}
