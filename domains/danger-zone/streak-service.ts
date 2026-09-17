import type { DbClient } from "@/db/client";
import { calculateCurrentStreakLength } from "@/domains/dashboard/dashboard-aggregation";
import { withIdempotency } from "@/domains/idempotency";
import { getReviewTimestampsInWindow } from "@/domains/srs/review-repository";
import { resolveUserNow } from "@/domains/users/user-clock";
import { findUserById } from "@/domains/users/user-repository";
import { getVacationPeriodsForUser } from "@/domains/users/vacation-repository";
import { dateKeyInTimeZone } from "@/lib/time/zoned-date";

import {
  getLatestStreakAdjustment,
  insertStreakAdjustment,
} from "./streak-repository";

/**
 * Injectable core (see `reset-service.ts`'s docstring for why this split
 * exists). `setManualStreak` and `getCurrentStreak` compose primitives
 * from `domains/dashboard` (the pure calculation), `domains/srs` (real
 * review activity), and `domains/users` (vacation history, timezone) —
 * this domain's job is only the composition, matching `resetToLevel`'s own
 * precedent of reaching into other domains' repository files directly.
 */

export type SetManualStreakInput = {
  userId: string;
  value: number;
  idempotencyKey: string;
  now?: Date;
};

/**
 * Spec 20 Danger Zone — Manually Set Streak. "Do not insert fake review
 * events" — this only ever writes `user_streak_adjustments`, never
 * `review_events`.
 */
export async function setManualStreak(
  db: DbClient,
  input: SetManualStreakInput,
): Promise<{ value: number }> {
  const now = input.now ?? (await resolveUserNow(db, input.userId));
  return withIdempotency(
    db,
    {
      userId: input.userId,
      operation: "danger-zone.set-manual-streak",
      key: input.idempotencyKey,
      payload: { value: input.value },
    },
    async (tx) => {
      const adjustment = await insertStreakAdjustment(tx, {
        userId: input.userId,
        value: input.value,
        now,
      });
      return { value: adjustment.value };
    },
  );
}

// Generous enough for any real account's history at this app's current age, without scanning unbounded history for a plain read.
const STREAK_LOOKBACK_DAYS = 400;

export type GetCurrentStreakInput = {
  userId: string;
  languageId: string;
  now?: Date;
};

/**
 * Spec 20 Danger Zone — the current authoritative streak length, per
 * `dashboard-aggregation.ts`'s `calculateCurrentStreakLength` ("Streak
 * calculation must remain centralized in the authoritative streak domain/
 * read model"). A plain read, not idempotency-wrapped — nothing here
 * writes anything. Defaults "now" to `resolveUserNow` (sandbox-time-
 * travel-aware), matching every other SRS-scheduling-adjacent read in this
 * codebase — a Server Component calling this has no direct `db` access to
 * do that resolution itself; `now` is overridable for deterministic tests.
 */
export async function getCurrentStreak(
  db: DbClient,
  input: GetCurrentStreakInput,
): Promise<number> {
  const user = await findUserById(db, input.userId);
  if (!user) return 0;

  const now = input.now ?? (await resolveUserNow(db, input.userId));
  const since = new Date(
    now.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const [reviewTimestamps, vacationPeriods, latestAdjustment] =
    await Promise.all([
      getReviewTimestampsInWindow(db, input.userId, input.languageId, {
        since,
        until: now,
      }),
      getVacationPeriodsForUser(db, input.userId),
      getLatestStreakAdjustment(db, input.userId),
    ]);

  const qualifyingDates = new Set(
    reviewTimestamps.map((timestamp) =>
      dateKeyInTimeZone(timestamp, user.timezone),
    ),
  );

  const vacationNeutralDates = new Set<string>();
  for (const period of vacationPeriods) {
    const end = period.endedAt ?? now;
    for (
      let cursor = new Date(period.startedAt);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      vacationNeutralDates.add(dateKeyInTimeZone(cursor, user.timezone));
    }
  }

  const manualAdjustment = latestAdjustment
    ? {
        value: latestAdjustment.value,
        setOnDate: dateKeyInTimeZone(latestAdjustment.createdAt, user.timezone),
      }
    : null;

  return calculateCurrentStreakLength({
    today: dateKeyInTimeZone(now, user.timezone),
    qualifyingDates,
    vacationNeutralDates,
    manualAdjustment,
  });
}
