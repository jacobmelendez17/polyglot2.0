import { formatAbsoluteDate } from "./format-absolute-date";

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * The item page's `Next Review` label (user decision, 2026-09-10, revising
 * unit 2's original relative-and-absolute pair) — one phrase, sized by how
 * soon the review actually is:
 *
 * - under a minute: `~ Less than a minute`
 * - under an hour: a minute count
 * - under a day: an hour count
 * - a day or more: the plain date, in the learner's timezone
 *
 * Display only, like `formatRelativeTime`/`formatAbsoluteDate` before it —
 * never used to decide whether a review is actually due. `target` and `now`
 * both come from authoritative server time; this function only chooses how
 * to phrase their difference.
 *
 * Buckets are chosen from the raw millisecond difference, not from the
 * rounded display number, so a review 59.6 minutes out reads "1 hour"
 * instead of a nonsensical "60 minutes", and one 23.6 hours out reads as a
 * date instead of "24 hours".
 */
export function formatNextReviewLabel(target: Date, now: Date, timeZone: string): string {
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return "Due now";
  if (diffMs < ONE_MINUTE_MS) return "~ Less than a minute";

  if (diffMs < ONE_HOUR_MS) {
    const minutes = Math.round(diffMs / ONE_MINUTE_MS);
    // Rounding can push a value just under the boundary (e.g. 59.6) up to
    // the next unit's number (60) — bump it into that unit's own phrasing
    // rather than print a value that unit never uses.
    return minutes >= 60 ? "1 hour" : pluralize(minutes, "minute");
  }

  if (diffMs < ONE_DAY_MS) {
    const hours = Math.round(diffMs / ONE_HOUR_MS);
    return hours >= 24 ? formatAbsoluteDate(target, timeZone) : pluralize(hours, "hour");
  }

  return formatAbsoluteDate(target, timeZone);
}
