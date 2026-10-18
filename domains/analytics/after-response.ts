import { after } from "next/server";

/**
 * Runs `task` once the response has been sent. Next's `after()` is the
 * documented way to do that, and on Vercel it keeps the function alive until the
 * task finishes (up to the route's maximum duration) — which is exactly what
 * analytics delivery needs, and what a bare un-awaited promise does not
 * guarantee: a serverless function can be frozen the moment its response is out.
 *
 * `after()` throws outside a request (a script, a test), where there is no
 * response to wait for and no function to freeze, so the task simply runs. The
 * task never rejects out of here: a failure is the task's to report, not the
 * caller's.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}
