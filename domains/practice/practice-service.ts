import type { DbClient } from "@/db/client";
import { resolveUserNow } from "@/domains/users/user-clock";
import { startOfDayInTimeZone } from "@/lib/time/zoned-date";

import { PRACTICE_ACTIVITY_WINDOW_DAYS } from "./practice-catalog";
import { buildPracticeHubView } from "./practice-hub-view";
import { getPracticeActivity } from "./practice-repository";
import type { PracticeHubView } from "./practice-types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Practice hub's read model. Reads only: it never writes progress, and
 * nothing it returns is an SRS or unlock value (architecture.md's `practice`
 * boundary). Takes an injected `DbClient` and is bound to the real database
 * in `./server.ts`, the same split `domains/dashboard` uses.
 *
 * `now` goes through `resolveUserNow` so a sandbox persona sees its own
 * simulated clock, like every other time-sensitive read here. "Today" starts
 * at midnight in the learner's own `timeZone`, not the server's.
 */
export async function getPracticeHub(
  db: DbClient,
  {
    userId,
    languageId,
    timeZone,
  }: { userId: string; languageId: string; timeZone: string },
): Promise<PracticeHubView> {
  const now = await resolveUserNow(db, userId);
  const since = new Date(
    now.getTime() - PRACTICE_ACTIVITY_WINDOW_DAYS * DAY_MS,
  );
  const todayStart = startOfDayInTimeZone(now, timeZone);
  const activity = await getPracticeActivity(
    db,
    userId,
    languageId,
    since,
    todayStart,
  );
  return buildPracticeHubView(activity, now);
}
