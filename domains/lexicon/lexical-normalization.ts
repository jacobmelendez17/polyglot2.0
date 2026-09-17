import { normalizeForComparison } from "@/lib/answer-checking/normalize";

/**
 * Spec 12 "Normalization". Permitted: trim whitespace, normalize the Unicode
 * representation, normalize case for matching, controlled punctuation
 * normalization. Forbidden: removing accents or diacritics — `el`/`él`,
 * `tu`/`tú`, `si`/`sí`, `como`/`cómo` must stay distinct terms.
 *
 * Built on top of `normalizeForComparison` rather than beside it, so lexical
 * matching can never drift from the duplicate-detection and answer-checking
 * rules the rest of Polyglot already shares (architecture.md's
 * duplicate-normalization rule, spec 08 §72's shared-module requirement).
 * This function only adds what those didn't need: Unicode NFC folding, so a
 * decomposed `e`+`◌́` from an external dump compares equal to a precomposed
 * `é` typed by an admin, and a small closed set of punctuation
 * substitutions for characters that vary purely by typography.
 */

/**
 * Typographic variants mapped to their plain ASCII equivalents. Deliberately
 * tiny and closed: these are the characters that differ only in rendering
 * convention between an external dump and hand-typed curriculum text.
 * Nothing here removes a character, and nothing touches Spanish's inverted
 * `¿`/`¡`, which are meaningful.
 */
const PUNCTUATION_SUBSTITUTIONS: readonly (readonly [RegExp, string])[] = [
  // Curly/modifier apostrophes → straight apostrophe.
  [/[\u2018\u2019\u02bc]/g, "'"],
  // Curly double quotes → straight double quote.
  [/[\u201c\u201d]/g, '"'],
  // Hyphen/en/em dashes and the minus sign → ASCII hyphen-minus.
  [/[\u2010-\u2015\u2212]/g, "-"],
  // Non-breaking and narrow no-break spaces → ordinary space, so the
  // whitespace collapse below can actually see them.
  [/[\u00a0\u202f]/g, " "],
];

/**
 * The one normalization used for every lexical comparison: dictionary
 * lemmas, dictionary forms, curriculum lookup forms, and regional word
 * lists. Both sides of every match must go through this — a value stored
 * normalized by one path and compared un-normalized by another is the
 * classic way accent handling silently breaks.
 */
export function normalizeLexicalForm(value: string): string {
  let result = value.normalize("NFC");
  for (const [pattern, replacement] of PUNCTUATION_SUBSTITUTIONS) {
    result = result.replace(pattern, replacement);
  }
  // NFC again after case folding: lowercasing can, for some scripts, emit a
  // decomposed sequence, and the stored value must be byte-comparable.
  return normalizeForComparison(result).normalize("NFC");
}

/**
 * Part-of-speech normalization shared by both sides of the POS comparison
 * step — the free-text `vocabulary_items.part_of_speech` an admin typed, and
 * whatever tag the source dump used. Language-neutral: the Spanish labels
 * are here because an admin authoring Spanish curriculum may reasonably type
 * either, not because this function is Spanish-specific.
 *
 * Returns `null` for anything unrecognized rather than guessing, so the
 * matcher treats an unknown POS as "no POS evidence" instead of as a
 * conflict.
 */
const PART_OF_SPEECH_ALIASES: Record<string, string> = {
  noun: "noun",
  n: "noun",
  sustantivo: "noun",
  substantive: "noun",
  name: "proper_noun",
  "proper noun": "proper_noun",
  proper_noun: "proper_noun",
  verb: "verb",
  v: "verb",
  verbo: "verb",
  adj: "adjective",
  adjective: "adjective",
  adjetivo: "adjective",
  adv: "adverb",
  adverb: "adverb",
  adverbio: "adverb",
  pron: "pronoun",
  pronoun: "pronoun",
  pronombre: "pronoun",
  prep: "preposition",
  preposition: "preposition",
  "prep phrase": "preposition",
  preposición: "preposition",
  conj: "conjunction",
  conjunction: "conjunction",
  conjunción: "conjunction",
  det: "determiner",
  determiner: "determiner",
  determinante: "determiner",
  article: "determiner",
  artículo: "determiner",
  num: "numeral",
  numeral: "numeral",
  número: "numeral",
  intj: "interjection",
  interjection: "interjection",
  interjección: "interjection",
  phrase: "phrase",
  prep_phrase: "phrase",
  proverb: "phrase",
  frase: "phrase",
  expression: "phrase",
  expresión: "phrase",
  particle: "particle",
  partícula: "particle",
};

export function normalizePartOfSpeech(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const key = normalizeLexicalForm(value);
  return PART_OF_SPEECH_ALIASES[key] ?? null;
}

/** True when a lookup form is a multiword expression, which spec 12 requires be matched as a whole and never decomposed. */
export function isMultiwordForm(value: string): boolean {
  return normalizeLexicalForm(value).includes(" ");
}
