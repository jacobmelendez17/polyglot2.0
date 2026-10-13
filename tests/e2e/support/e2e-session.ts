import type { Page } from "@playwright/test";

/**
 * Clerk's session token (`__session`) lives for **60 seconds**. A browser page
 * keeps it fresh — Clerk's own JavaScript renews it, and a document request
 * re-issues it — but Playwright's standalone `request` fixture has its own
 * cookie jar and no JavaScript, so a stored `storageState` goes stale a minute
 * after `auth.setup.ts` minted it. A test that calls the API through `request`
 * then gets a 401 that says nothing about the app: it only means the suite had
 * been running for over a minute.
 *
 * (Measured, not assumed: an aged `request` fixture answered 401 and never
 * recovered; `page.request` and an in-page `fetch` answered 200 right after a
 * page load. Real users are unaffected for the same reason: their tab runs
 * Clerk.)
 *
 * Call this before any API request that must reflect a *signed-in* caller, and
 * make the request through `page.request`, which shares the page's renewed
 * cookies. Any app page works — the root layout loads Clerk everywhere — so
 * the cheap public landing page is the default.
 */
export async function renewSession(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() =>
    Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
  );
}
