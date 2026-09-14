import { db } from "@/db/client";
import { reconcileFluentSchedules } from "@/domains/progress/repository";
import { resolveUserNow } from "@/domains/users/server";
import { getRateLimiter } from "@/providers/rate-limit";
import { AppError } from "@/lib/errors/app-error";
import { ReviewError } from "@/lib/errors/review-errors";

import * as ghostOrchestration from "./ghost-orchestration";
import * as orchestration from "./review-orchestration";
import * as preferenceRepository from "./review-preference-repository";
import * as repository from "./review-repository";
import type { SubmitGhostAnswerInput } from "./ghost-orchestration";
import type { GetReviewHistoryInput, InsertReviewEventInput } from "./review-history-types";
import type { StartReviewSessionInput, SubmitReviewAnswerInput } from "./review-orchestration";
import type {
  GhostMode,
  HintMode,
  HintOrder,
  ReviewQueueTimingMode,
  ReviewType,
  ReviewUiToggleField,
  SrsIntervalMode,
  SrsStrictness,
  UndoAction,
} from "./review-preference";

/**
 * Every Settings mutation in `domains/srs` shares the same "account-settings"
 * rate limit — checked here, not in the repository, since the limiter
 * provider is `server-only`-guarded and would make the repository
 * untestable against a rolled-back transaction (same reasoning as every
 * other domain's service layer in this codebase).
 */
async function withAccountSettingsRateLimit<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const decision = await getRateLimiter().check({ policy: "account-settings", subject: userId });
  if (!decision.allowed) {
    throw new AppError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  return fn();
}

/**
 * Binds the real app database to the injectable review repository/
 * orchestration functions — see `domains/progress/service.ts` for the same
 * pattern. Not guarded with `import "server-only"` directly — importing
 * `db` from `db/client.ts` already carries that guard transitively (as does
 * `providers/rate-limit`, imported below).
 */

export async function insertReviewEvent(input: InsertReviewEventInput) {
  return repository.insertReviewEvent(db, input);
}

export async function getReviewHistory(input: GetReviewHistoryInput) {
  return repository.getReviewHistory(db, input);
}

export async function getReviewTimestampsInWindow(userId: string, languageId: string, window: { since: Date; until: Date }) {
  return repository.getReviewTimestampsInWindow(db, userId, languageId, window);
}

/**
 * Resolves the caller's perceived `now` before any due-review work (spec 11's
 * sandbox clock). Identical to real server time for every ordinary learner;
 * only a sandbox persona can carry an offset. An explicit `now` from the
 * caller still wins, which is what keeps the orchestration tests
 * deterministic.
 */
export async function startReviewSession(input: StartReviewSessionInput) {
  const now = input.now ?? (await resolveUserNow(db, input.userId)).getTime();
  return orchestration.startReviewSession(db, { ...input, now });
}

/**
 * Spec 09 §13: every authoritative review submission is rate limited before
 * any database work happens. Enforced here, not inside
 * `review-orchestration.ts`, because the rate-limit provider is
 * server-only-guarded and that module must stay plain-`DbClient`-testable
 * (see `review-orchestration.ts`'s own docstring on why).
 */
export async function submitReviewAnswer(input: SubmitReviewAnswerInput) {
  const decision = await getRateLimiter().check({ policy: "review-submit", subject: input.userId });
  if (!decision.allowed) {
    throw new ReviewError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  const now = input.now ?? (await resolveUserNow(db, input.userId)).getTime();
  return orchestration.submitReviewAnswer(db, { ...input, now });
}

/** Spec 20 Ghost Reviews — grading a Ghost review, rate-limited the same way as a normal review submission (see `submitReviewAnswer`). */
export async function submitGhostAnswer(input: SubmitGhostAnswerInput) {
  const decision = await getRateLimiter().check({ policy: "review-submit", subject: input.userId });
  if (!decision.allowed) {
    throw new ReviewError("RATE_LIMITED", `Please slow down and try again in ${decision.retryAfterSeconds}s.`);
  }
  const now = input.now ?? (await resolveUserNow(db, input.userId)).getTime();
  return ghostOrchestration.submitGhostAnswer(db, { ...input, now });
}

/** This learner's Review Type preferences for one language, or the centralized defaults (spec 20 Reviews). */
export async function getReviewPreferences(userId: string, languageId: string) {
  return preferenceRepository.findReviewPreferences(db, userId, languageId);
}

/** Spec 20 Reviews — Grammar Review Type. */
export async function updateGrammarReviewType(input: { userId: string; languageId: string; reviewType: ReviewType }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveGrammarReviewType(db, input));
}

/** Spec 20 Reviews — Vocabulary Review Type. */
export async function updateVocabularyReviewType(input: { userId: string; languageId: string; reviewType: ReviewType }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveVocabularyReviewType(db, input));
}

/** Spec 20 Review Hints — Grammar Hint Order. */
export async function updateGrammarHintOrder(input: { userId: string; languageId: string; hintOrder: HintOrder }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveGrammarHintOrder(db, input));
}

/** Spec 20 Review Hints — Vocabulary Hint Order. */
export async function updateVocabularyHintOrder(input: { userId: string; languageId: string; hintOrder: HintOrder }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveVocabularyHintOrder(db, input));
}

/** Spec 20 Review Hints — Grammar Hint Mode. */
export async function updateGrammarHintMode(input: { userId: string; languageId: string; hintMode: HintMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveGrammarHintMode(db, input));
}

/** Spec 20 Review Hints — Vocabulary Hint Mode. */
export async function updateVocabularyHintMode(input: { userId: string; languageId: string; hintMode: HintMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveVocabularyHintMode(db, input));
}

/** Spec 20 Review UI — any of the seven independent boolean toggles. */
export async function updateReviewUiToggle(input: { userId: string; languageId: string; field: ReviewUiToggleField; value: boolean }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveReviewUiToggle(db, input));
}

/** Spec 20 Review UI — Undo Action. */
export async function updateUndoAction(input: { userId: string; languageId: string; undoAction: UndoAction }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveUndoAction(db, input));
}

/** Spec 20 SRS Strictness — Grammar SRS Strictness. */
export async function updateGrammarSrsStrictness(input: { userId: string; languageId: string; srsStrictness: SrsStrictness }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveGrammarSrsStrictness(db, input));
}

/** Spec 20 SRS Strictness — Vocabulary SRS Strictness. */
export async function updateVocabularySrsStrictness(input: { userId: string; languageId: string; srsStrictness: SrsStrictness }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveVocabularySrsStrictness(db, input));
}

/** Spec 20 SRS Interval — Grammar SRS Interval. */
export async function updateGrammarSrsIntervalMode(input: { userId: string; languageId: string; srsIntervalMode: SrsIntervalMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveGrammarSrsIntervalMode(db, input));
}

/** Spec 20 SRS Interval — Vocabulary SRS Interval. */
export async function updateVocabularySrsIntervalMode(input: { userId: string; languageId: string; srsIntervalMode: SrsIntervalMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveVocabularySrsIntervalMode(db, input));
}

/** Spec 20 Review Queue Timing. */
export async function updateReviewQueueTiming(input: { userId: string; languageId: string; reviewQueueTiming: ReviewQueueTimingMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveReviewQueueTiming(db, input));
}

/**
 * Spec 20 Fluent Mode — Grammar Fluent Mode. Unlike every other narrow
 * Settings mutation above, this has a real cascading effect on already-
 * Fluent items (`reconcileFluentSchedules`'s docstring), so the preference
 * write and the reconciliation share one transaction — both commit
 * together or not at all, the same guarantee `vacation-service.ts`'s
 * `disableVacationMode` already established for an equivalent
 * toggle-with-cascading-schedule-effect case.
 */
export async function updateGrammarFluentMode(input: { userId: string; languageId: string; fluentMode: boolean }) {
  return withAccountSettingsRateLimit(input.userId, () =>
    db.transaction(async (tx) => {
      const updated = await preferenceRepository.saveGrammarFluentMode(tx, input);
      await reconcileFluentSchedules(tx, {
        userId: input.userId,
        languageId: input.languageId,
        itemType: "grammar",
        fluentModeEnabled: input.fluentMode,
      });
      return updated;
    }),
  );
}

/** Spec 20 Fluent Mode — Vocabulary Fluent Mode. See `updateGrammarFluentMode`. */
export async function updateVocabularyFluentMode(input: { userId: string; languageId: string; fluentMode: boolean }) {
  return withAccountSettingsRateLimit(input.userId, () =>
    db.transaction(async (tx) => {
      const updated = await preferenceRepository.saveVocabularyFluentMode(tx, input);
      await reconcileFluentSchedules(tx, {
        userId: input.userId,
        languageId: input.languageId,
        itemType: "vocabulary",
        fluentModeEnabled: input.fluentMode,
      });
      return updated;
    }),
  );
}

/**
 * Spec 20 Ghost Reviews — Grammar Ghost Reviews. Unlike Fluent Mode, no
 * cascading reconciliation on toggle: "Off... Existing active Ghosts should
 * remain available unless explicitly reset from Danger Zone" — Off only
 * stops new Ghosts from being created going forward, so this is a plain
 * narrow single-column save like SRS Strictness/Interval.
 */
export async function updateGrammarGhostMode(input: { userId: string; languageId: string; ghostMode: GhostMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveGrammarGhostMode(db, input));
}

/** Spec 20 Ghost Reviews — Vocabulary Ghost Reviews. See `updateGrammarGhostMode`. */
export async function updateVocabularyGhostMode(input: { userId: string; languageId: string; ghostMode: GhostMode }) {
  return withAccountSettingsRateLimit(input.userId, () => preferenceRepository.saveVocabularyGhostMode(db, input));
}
