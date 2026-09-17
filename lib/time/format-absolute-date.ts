/**
 * Absolute date formatting for display, in the learner's own timezone.
 *
 * The timezone is always passed in, never read from the browser: an
 * authoritative timestamp is stored in UTC and `users.timezone` is what the
 * learner chose, so rendering it against whatever clock the current device
 * happens to be set to would show two different dates for the same event on
 * two devices.
 */

/** e.g. `Sep 9, 2026`. */
export function formatAbsoluteDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone,
  }).format(date);
}
