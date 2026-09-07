import { normalizeLexicalForm } from "./lexical-normalization";

/**
 * Spec 12 "Spanish Matching" / "Multilingual Requirement": matching must use
 * a language-specific provider, never hardcoded Spanish rules inside generic
 * repository code. Everything a language needs to teach the generic matcher
 * how its written forms behave lives behind this interface, so adding
 * Japanese (JMdict) later means adding a provider, not editing the matcher.
 */
export interface LexicalLanguageProvider {
  /** The `languages.code` this provider serves. */
  readonly languageCode: string;

  /**
   * Ordered candidate lookup forms for a curriculum display word, most
   * specific first. The full expression always comes first: spec 12 requires
   * exact phrase/expression matching be attempted before anything else, and
   * forbids decomposing an expression into its component words.
   */
  deriveDictionaryLookups(displayWord: string): string[];

  /**
   * Regions this language cares about, most specific first. The first entry
   * is the primary region — the one the matcher uses as a tie-breaker and
   * the Admin review queue shows by default.
   */
  readonly regionCodes: readonly string[];

  /**
   * Maps a source-provided usage/region label (e.g. Wiktionary's "Mexico",
   * "Spain") onto a region code, or `null` when the label carries no
   * regional meaning. Used to detect a genuine regional restriction — never
   * to infer one from mere absence.
   */
  regionCodeForSourceLabel(label: string): string | null;
}

/**
 * Spanish articles that may legitimately precede a noun in a curriculum
 * display word. Accented `él` (the pronoun) is deliberately absent — it is a
 * different word, and normalization preserves the accent precisely so this
 * set can't accidentally match it.
 */
const SPANISH_ARTICLES = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas"]);

const SPANISH_REGION_LABELS: Record<string, string> = {
  mexico: "es-MX",
  "mexican spanish": "es-MX",
  mexican: "es-MX",
  spain: "es-ES",
  "peninsular spain": "es-ES",
  castilian: "es-ES",
  argentina: "es-AR",
  colombia: "es-CO",
  chile: "es-CL",
  peru: "es-PE",
  venezuela: "es-VE",
};

/**
 * Spanish lexical behavior (spec 12 "Spanish Matching").
 *
 * The only structural transformation is article removal, and only where it
 * is actually appropriate: the leading token must be an article *and*
 * something must remain after it. Spec 12 is explicit that the first token
 * of every phrase must not be blindly stripped — so `por favor`, `de nada`,
 * and `buenos días` all yield exactly one lookup form, their own, while
 * `el padre` yields `el padre` then `padre`.
 *
 * Note what this deliberately does not do: it never splits a multiword
 * expression into component words. Every form it returns is either the whole
 * input or the whole input minus a leading article, so the matcher can treat
 * each lookup form as an indivisible unit and spec 12's "do not fabricate a
 * dictionary entry by combining separate words" holds structurally rather
 * than by convention.
 */
export const spanishLexicalProvider: LexicalLanguageProvider = {
  languageCode: "es",

  regionCodes: ["es-MX", "es"],

  deriveDictionaryLookups(displayWord: string): string[] {
    const normalized = normalizeLexicalForm(displayWord);
    if (normalized.length === 0) return [];

    const lookups = [normalized];

    const tokens = normalized.split(" ");
    if (tokens.length > 1 && SPANISH_ARTICLES.has(tokens[0])) {
      const withoutArticle = tokens.slice(1).join(" ");
      if (withoutArticle.length > 0) lookups.push(withoutArticle);
    }

    return lookups;
  },

  regionCodeForSourceLabel(label: string): string | null {
    return SPANISH_REGION_LABELS[normalizeLexicalForm(label)] ?? null;
  },
};

/**
 * Fallback for a language with no provider yet. Matches the whole display
 * word and nothing else — no article rules, no regions. Correct-by-default:
 * a language Polyglot has not taught the lexicon about gets exact matching
 * rather than another language's morphology applied to it.
 */
export const defaultLexicalProvider: LexicalLanguageProvider = {
  languageCode: "*",
  regionCodes: [],
  deriveDictionaryLookups(displayWord: string): string[] {
    const normalized = normalizeLexicalForm(displayWord);
    return normalized.length > 0 ? [normalized] : [];
  },
  regionCodeForSourceLabel(): string | null {
    return null;
  },
};

const PROVIDERS: Record<string, LexicalLanguageProvider> = {
  [spanishLexicalProvider.languageCode]: spanishLexicalProvider,
};

/**
 * The base language subtag of a BCP-47-ish code: `es-MX` → `es`, `es` → `es`.
 *
 * Polyglot's own `languages.code` is regional (`es-MX`, per
 * `domains/users`' provisioning default), while lexical sources are
 * organized by language (Wiktextract's `lang_code` is `es`). Both resolve to
 * the same lexical behavior, so lookups fall back to the base subtag rather
 * than requiring an entry per region.
 */
export function baseLanguageSubtag(languageCode: string): string {
  return languageCode.toLowerCase().split("-")[0];
}

/**
 * Resolves the provider for a `languages.code`. Tries the full code first,
 * so a region could one day get its own provider, then the base subtag —
 * `es-MX` and `es` both reach the Spanish provider today. Falls back to
 * exact-match-only behavior for languages without one.
 */
export function getLexicalLanguageProvider(languageCode: string): LexicalLanguageProvider {
  const normalized = languageCode.toLowerCase();
  return PROVIDERS[normalized] ?? PROVIDERS[baseLanguageSubtag(normalized)] ?? defaultLexicalProvider;
}

/**
 * Convenience for the common curriculum shape: a vocabulary item stores its
 * article separately from its term (`vocabulary_items.article`/`term`), and
 * the display word learners see is the two composed — the same composition
 * `domains/curriculum/level-view.ts` already performs for level cards.
 */
export function composeVocabularyDisplayWord(term: string, article: string | null | undefined): string {
  return article ? `${article} ${term}` : term;
}
