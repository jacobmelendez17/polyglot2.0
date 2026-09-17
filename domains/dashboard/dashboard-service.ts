import type { DbClient } from "@/db/client";
import {
  getLevelItems,
  getLevelsByLanguage,
} from "@/domains/curriculum/curriculum-repository";
import { getEligibleLessonItems } from "@/domains/curriculum/lesson-curriculum-repository";
import {
  countProgressForItems,
  getDueReviewItems,
  getNextUpcomingReviewAt,
  getUnlockedLevels,
  getUpcomingReviewForecast,
} from "@/domains/progress/repository";
import { getReviewTimestampsInWindow } from "@/domains/srs/review-repository";
import { resolveUserNow } from "@/domains/users/user-clock";

import {
  buildForecastBuckets,
  buildReviewHistoryBuckets,
  buildStreak,
} from "./dashboard-aggregation";
import type { DashboardData } from "./dashboard-types";

const FORECAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The real dashboard read model (spec 13), replacing the fixture spec 06
 * shipped as a stand-in. Aggregates real data from `curriculum`, `progress`,
 * and `srs` — this domain never computes SRS/unlock state itself
 * (architecture.md's `dashboard` boundary), only reads and buckets what
 * those domains already decided.
 *
 * Takes an injected `DbClient` and calls the other domains' *repository*-tier
 * functions directly, not their real-`db`-bound `server.ts` exports — the
 * same cross-domain composition `domains/srs/review-orchestration.ts`
 * already established (see progress-tracker.md's Architecture Decisions),
 * for the identical reason: those `server.ts` exports transitively import
 * `db/client.ts`, whose `server-only` guard throws outside Next's build,
 * including under Vitest. `./server.ts` binds the real `db` singleton.
 *
 * `now` is resolved through `resolveUserNow` (spec 11's sandbox clock),
 * matching every other time-sensitive read/write in this codebase — an
 * admin viewing their sandbox persona sees due-counts and forecasts
 * computed against that persona's simulated time, not real server time.
 */
export async function getDashboardData(
  db: DbClient,
  { userId, languageId }: { userId: string; languageId: string },
): Promise<DashboardData> {
  const now = await resolveUserNow(db, userId);
  const forecastWindowEnd = new Date(now.getTime() + FORECAST_WINDOW_MS);
  const historyWindowStart = new Date(now.getTime() - HISTORY_WINDOW_MS);

  const [
    eligibleItems,
    dueItems,
    forecastItems,
    historyTimestamps,
    unlockedLevelProgress,
    allLevels,
  ] = await Promise.all([
    getEligibleLessonItems(db, userId, languageId),
    getDueReviewItems(db, userId, languageId, now),
    getUpcomingReviewForecast(db, userId, languageId, {
      after: now,
      until: forecastWindowEnd,
    }),
    getReviewTimestampsInWindow(db, userId, languageId, {
      since: historyWindowStart,
      until: now,
    }),
    getUnlockedLevels(db, userId, languageId),
    getLevelsByLanguage(db, languageId),
  ]);

  // Nothing currently due doesn't mean nothing is scheduled — check for the
  // next upcoming review separately only in that case, rather than always
  // paying for a query the "Reviews" card won't use when something is due.
  const nextReviewAt =
    dueItems.length === 0
      ? await getNextUpcomingReviewAt(db, userId, languageId, now)
      : null;

  // "Current level" is the highest level the learner has unlocked — every
  // level unlock cascades forward, so this is where they're actually
  // working. Level 1 is always unlocked at provisioning (architecture.md),
  // so the `?? 1` fallback below is defensive, not an expected path.
  const levelNumberById = new Map(
    allLevels.map((level) => [level.id, level.levelNumber]),
  );
  const unlockedLevelNumbers = unlockedLevelProgress
    .map((progress) => levelNumberById.get(progress.levelId))
    .filter((levelNumber): levelNumber is number => levelNumber !== undefined);
  const currentLevelNumber =
    unlockedLevelNumbers.length > 0 ? Math.max(...unlockedLevelNumbers) : 1;
  const currentLevel =
    allLevels.find((level) => level.levelNumber === currentLevelNumber) ?? null;

  // Vocabulary/grammar totals are the level's real published item count
  // (spec 11's per-level targets are a validation config, not necessarily
  // what actually exists), so "learned" is always out of what a learner can
  // actually see, never an abstract target.
  const levelItems = currentLevel
    ? await getLevelItems(db, currentLevel.id)
    : [];
  const vocabularyIds = levelItems
    .filter((item) => item.type === "vocabulary")
    .map((item) => item.id);
  const grammarIds = levelItems
    .filter((item) => item.type === "grammar")
    .map((item) => item.id);
  const [vocabularyLearned, grammarLearned] = await Promise.all([
    countProgressForItems(db, userId, vocabularyIds),
    countProgressForItems(db, userId, grammarIds),
  ]);

  return {
    lessons: { availableCount: eligibleItems.length },
    reviews: {
      availableCount: dueItems.length,
      nextReviewAt: nextReviewAt ? nextReviewAt.toISOString() : null,
    },
    forecast: buildForecastBuckets(now, forecastItems),
    reviewHistory: buildReviewHistoryBuckets(now, historyTimestamps),
    levelProgress: {
      currentLevel: currentLevelNumber,
      streak: buildStreak(now, historyTimestamps),
      vocabulary: { learned: vocabularyLearned, total: vocabularyIds.length },
      grammar: { learned: grammarLearned, total: grammarIds.length },
      overall: {
        learned: vocabularyLearned + grammarLearned,
        total: vocabularyIds.length + grammarIds.length,
      },
    },
  };
}
