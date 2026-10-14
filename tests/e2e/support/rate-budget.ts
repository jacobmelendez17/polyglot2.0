/**
 * Admin writes are rate limited per signed-in Admin (`providers/rate-limit/
 * policies.ts`): `admin-publish` allows 10 requests / 60s (publishing an item,
 * or setting a level's status to `published`) and `admin-mutation` allows 30 /
 * 60s (every other Admin write). They are real controls, never relaxed for
 * tests — so a spec that spends from them on purpose keeps its own account of
 * what it has sent and waits out the window rather than tripping it, the same
 * stance as `clickRespectingDangerZoneRateLimit`.
 *
 * The account is module state, and Playwright runs every spec file of a worker
 * in one process, so specs that share a limit share one account — `admin-review`
 * and `admin-levels` both spend from `admin-publish`. (A restarted worker, after
 * a failure, starts empty; by then the window has long passed.)
 */

export type AdminRatePolicy =
  | "admin-publish"
  | "admin-mutation"
  | "admin-role-change"
  | "admin-user-search";

const POLICY: Record<AdminRatePolicy, { limit: number; spend: number }> = {
  // Spend at most 80% of the limit, leaving room for neighbouring specs.
  "admin-publish": { limit: 10, spend: 8 },
  "admin-mutation": { limit: 30, spend: 24 },
  // Spec 26 Unit 6: role changes (10 / 60s) and every read of the account list (30 / 60s).
  "admin-role-change": { limit: 10, spend: 8 },
  "admin-user-search": { limit: 30, spend: 24 },
};
const WINDOW_MS = 62_000; // the policy's 60s, plus a margin

const spent: Record<AdminRatePolicy, number[]> = {
  "admin-publish": [],
  "admin-mutation": [],
  "admin-role-change": [],
  "admin-user-search": [],
};

/**
 * Records that a spec has just used up `policy`'s *whole* limit on purpose (to
 * see the real 429), so every later spend waits out the window rather than
 * being refused by a limit that still holds the burst.
 */
export function markRateLimitExhausted(policy: AdminRatePolicy): void {
  const now = Date.now();
  for (let index = 0; index < POLICY[policy].limit; index++)
    spent[policy].push(now);
}

/** Call before sending `count` requests that will reach the service under `policy`. */
export async function spendRateBudget(
  policy: AdminRatePolicy,
  count = 1,
): Promise<void> {
  const times = spent[policy];
  const { spend } = POLICY[policy];
  for (;;) {
    const now = Date.now();
    while (times.length > 0 && now - times[0]! >= WINDOW_MS) times.shift();
    if (times.length + count <= spend) break;
    await new Promise((resolve) =>
      setTimeout(resolve, times[0]! + WINDOW_MS - now),
    );
  }
  for (let index = 0; index < count; index++) times.push(Date.now());
}
