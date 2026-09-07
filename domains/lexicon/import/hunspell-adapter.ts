import { normalizeLexicalForm } from "../lexical-normalization";

/**
 * The RLA-ES adapter (spec 12 "RLA Import"). Hunspell's `.dic`/`.aff` format
 * is understood here and nowhere else — generic application code asks
 * `getRegionalEvidence(term, region)` and never learns that affix flags,
 * `SET` encoding declarations, or a leading entry count exist.
 *
 * Only the `.dic` word list is projected. `.aff` is read solely to confirm
 * the declared encoding, because a mis-decoded Spanish word list silently
 * mangles exactly the accented characters the whole normalization rule
 * exists to protect.
 */

export interface HunspellEntry {
  word: string;
  normalizedWord: string;
  /** Everything after the `/` on the line, retained verbatim for later reprocessing. */
  affixFlags: string | null;
}

/**
 * Reads the `SET` line from a `.aff` file. Hunspell dictionaries for Spanish
 * are commonly ISO-8859-1 rather than UTF-8, and decoding those bytes as
 * UTF-8 turns `día` into replacement characters — a silent data-quality
 * failure that would look like a matching bug much later.
 */
export function parseHunspellEncoding(affContent: string): string {
  const match = affContent.match(/^SET\s+(\S+)/m);
  return match ? match[1].trim().toUpperCase() : "UTF-8";
}

/** Maps a Hunspell encoding declaration onto a Node `BufferEncoding`, defaulting to UTF-8 for anything unrecognized. */
export function toBufferEncoding(hunspellEncoding: string): BufferEncoding {
  switch (hunspellEncoding) {
    case "UTF-8":
    case "UTF8":
      return "utf8";
    case "ISO8859-1":
    case "ISO-8859-1":
    case "LATIN1":
      return "latin1";
    default:
      return "utf8";
  }
}

/**
 * Parses a Hunspell `.dic` body into word entries.
 *
 * Handled deliberately:
 * - the optional leading entry-count line, which is not a word;
 * - `#` comment lines;
 * - `word/FLAGS`, splitting on the first unescaped `/` only;
 * - `\/` escapes, which are a literal slash inside a word;
 * - `word po:noun`-style morphological fields, which follow whitespace.
 *
 * Words are not deduplicated here — `regional_lexemes`' unique constraint on
 * `(source, region, normalized word)` is the authority on that, so a
 * duplicate in the source is resolved by the database rather than by two
 * different code paths disagreeing.
 */
export function parseHunspellDictionary(dicContent: string): HunspellEntry[] {
  const lines = dicContent.split(/\r?\n/);
  const entries: HunspellEntry[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    // The first line is an entry count in a well-formed .dic file. Skipping a
    // line that is purely digits is safe: no Spanish headword is a bare number.
    if (index === 0 && /^\d+$/.test(line)) continue;

    // Morphological fields are separated from the headword by whitespace.
    const [headword] = line.split(/\s+/, 1);
    if (!headword) continue;

    let word = headword;
    let affixFlags: string | null = null;
    const slashIndex = findUnescapedSlash(headword);
    if (slashIndex >= 0) {
      word = headword.slice(0, slashIndex);
      affixFlags = headword.slice(slashIndex + 1) || null;
    }
    word = word.replace(/\\\//g, "/");
    if (word.length === 0) continue;

    entries.push({ word, normalizedWord: normalizeLexicalForm(word), affixFlags });
  }

  return entries;
}

function findUnescapedSlash(value: string): number {
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === "/" && value[i - 1] !== "\\") return i;
  }
  return -1;
}
