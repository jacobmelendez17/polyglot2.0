import type { Locator, Page } from "@playwright/test";

/**
 * Danger Zone's account-destroying actions (Reset Entire Account, and
 * Delete Account's request/confirm/cancel) share one tight rate-limit
 * policy (`providers/rate-limit/policies.ts`'s "danger-zone-account-reset",
 * 2 requests/60s) — deliberately, since these are the most destructive
 * per-account operations short of deletion itself. A real, documented
 * security control, not a fixture to relax for test convenience: when a
 * spec's own sequence of calls (or a same-second-neighboring spec sharing
 * the one permanent E2E learner) trips it, the right response is to wait
 * out the real window and retry, never to weaken the limit.
 */
export async function clickRespectingDangerZoneRateLimit(page: Page, button: Locator): Promise<void> {
  await button.click();
  const rateLimited = page.getByText(/slow down and try again in (\d+)s/i);
  // `isVisible()` checks immediately and never waits (unlike `expect`/
  // `waitFor`), so it would otherwise run before the Server Action's
  // response — and its error state — has even landed.
  const wasRateLimited = await rateLimited
    .waitFor({ state: "visible", timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (wasRateLimited) {
    const match = /in (\d+)s/i.exec((await rateLimited.textContent()) ?? "");
    const retryAfterMs = (Number(match?.[1] ?? 60) + 2) * 1000;
    await page.waitForTimeout(retryAfterMs);
    await button.click();
  }
}
