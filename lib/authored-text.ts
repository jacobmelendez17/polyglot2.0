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

/** The text as it should be spoken or compared: the ticks gone, the words kept. */
export function stripEmphasisMarks(text: string): string {
  return text.replace(EMPHASIS_PATTERN, "$1");
}
