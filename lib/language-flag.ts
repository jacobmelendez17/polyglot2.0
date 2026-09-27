/**
 * A flag emoji for a `languages.code` (e.g. `es-MX`, `tl-PH`) — a stand-in
 * for real language artwork on the language-choice screen ("for now",
 * 2026-09-27 decision). Derived algorithmically from the code's region
 * subtag via Unicode's regional-indicator symbols, not a hardcoded
 * per-language table — architecture.md's "must not assume a single
 * language" applies just as much to display helpers as to domain logic, so
 * a new language never needs an entry added here to get a flag.
 *
 * Returns a plain white-flag placeholder for a code with no two-letter
 * region subtag, rather than guessing.
 */
export function regionFlagEmoji(languageCode: string): string {
  const region = languageCode.split("-")[1];
  if (!region || region.length !== 2) return "\u{1F3F3}\u{FE0F}";

  const codePoints = [...region.toUpperCase()].map(
    (char) => 0x1f1e6 + (char.charCodeAt(0) - 65),
  );
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) {
    return "\u{1F3F3}\u{FE0F}";
  }
  return String.fromCodePoint(...codePoints);
}
