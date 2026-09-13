/**
 * The canonical IANA timezone list (spec 20 General — Timezone), from the
 * runtime's own `Intl` implementation rather than a bundled/maintained list
 * — it's already correct, already kept current by the JS engine, and
 * available identically on the server (validation) and the client
 * (populating the picker), so one list serves both without a new
 * dependency or a second copy to keep in sync.
 *
 * `Intl.supportedValuesOf("timeZone")` does **not** include `"UTC"` —
 * confirmed directly against this runtime, not assumed — even though
 * `new Intl.DateTimeFormat(undefined, { timeZone: "UTC" })` accepts it
 * without error. ICU's enumerable list is canonical IANA zone names only;
 * `"UTC"` is a separately-specified alias every engine still has to accept.
 * `users.timezone` defaults to exactly `"UTC"` for every account (spec 08),
 * so silently excluding it here would have made the picker unable to find
 * or re-select the value nearly every account starts with.
 */
const UTC = "UTC";

export function getSupportedTimezones(): string[] {
  return [UTC, ...Intl.supportedValuesOf("timeZone")];
}

const SUPPORTED_TIMEZONE_SET = new Set(getSupportedTimezones());

/** Whether `value` is a real IANA timezone identifier — used both for Zod validation at the Server Action boundary and to guard against a stale/invalid stored value at read time. */
export function isSupportedTimezone(value: string): boolean {
  return SUPPORTED_TIMEZONE_SET.has(value);
}
