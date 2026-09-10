/**
 * Absolute date/time formatting for display, in the learner's own timezone.
 *
 * `formatRelativeTime` answers "how long until this?"; these answer "when,
 * exactly?" — spec 18's Progress section needs both (`Next Review` reads
 * better relative, `Unlock Date` and `Retired Date` need the actual day).
 *
 * The timezone is always passed in, never read from the browser: an
 * authoritative timestamp is stored in UTC and `users.timezone` is what the
 * learner chose, so rendering it against whatever clock the current device
 * happens to be set to would show two different dates for the same event on
 * two devices.
 */

/** e.g. `Sep 9, 2026`. */
export function formatAbsoluteDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(date);
}

/** e.g. `Sep 9, 2026, 3:04 PM`. */
export function formatAbsoluteDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}
