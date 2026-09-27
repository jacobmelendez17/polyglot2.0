/**
 * The admin 'word' emphasis shortcut, shared by what renders it
 * (`components/shared/authored-text.tsx`) and what must ignore it (audio).
 *
 * A run inside straight single quotes marks a word or phrase to emphasize.
 * The quote must open at the start of the text or after a non-letter and
 * close before a non-letter, so apostrophes inside words ("don't",
 * "l'amour", "it's") are never mistaken for one.
 */
export const EMPHASIS_PATTERN =
  /(?<![\p{L}\p{N}])'([^'\n]+?)'(?![\p{L}\p{N}])/gu;

/**
 * The second admin "word" emphasis shortcut — a run inside straight double
 * quotes marks a word or phrase for the second highlight color. Unlike `'`,
 * prose never uses `"` inside a word, so this needs no apostrophe-style
 * exclusion around it.
 */
export const DOUBLE_QUOTE_EMPHASIS_PATTERN = /"([^"\n]+?)"/gu;

/** The text as it should be spoken or compared: the quote marks gone, the words kept. */
export function stripEmphasisMarks(text: string): string {
  return text
    .replace(EMPHASIS_PATTERN, "$1")
    .replace(DOUBLE_QUOTE_EMPHASIS_PATTERN, "$1");
}
