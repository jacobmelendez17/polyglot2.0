/**
 * Timezone-safe "start of day" alignment (spec 20 Review Queue Timing —
 * "Use timezone-safe date handling. Do not align Start-of-Day using server
 * UTC midnight."). No date library exists in this codebase
 * (`lib/time/format-absolute-date.ts` is the existing precedent for reading
 * a date in a timezone via bare `Intl`) — this derives the correct UTC
 * instant the same way libraries like `date-fns-tz`'s `fromZonedTime` do
 * internally, without adding a dependency.
 */

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

/**
 * The UTC instant at which `year`-`month`-`day` 00:00:00 occurs in
 * `timeZone`. Works by guessing that instant is the same wall-clock reading
 * in UTC, then correcting by however far that guess's own wall-clock time in
 * `timeZone` drifted from midnight. Not iterated to a fixed point, so an
 * instant that falls exactly within a DST transition can be off by the
 * transition's own size (at most an hour) — an acceptable, extremely rare
 * edge case for a once-daily scheduling boundary.
 */
function localMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const zonedGuess = getZonedDateParts(new Date(utcGuess), timeZone);
  const zonedGuessAsUtc = Date.UTC(zonedGuess.year, zonedGuess.month - 1, zonedGuess.day, zonedGuess.hour, zonedGuess.minute, zonedGuess.second);
  const drift = zonedGuessAsUtc - utcGuess;
  return new Date(utcGuess - drift);
}

/** Aligns `date` to 00:00:00 on its own calendar date as seen in `timeZone`. */
export function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const { year, month, day } = getZonedDateParts(date, timeZone);
  return localMidnightToUtc(year, month, day, timeZone);
}
