/**
 * Shared BCP-47-ish language-code helpers.
 *
 * Polyglot's own `languages.code` is regional (`es-MX`), while most
 * language-level configuration — lexical behavior, character helpers, display
 * names — is the same for every region of a language. Rather than duplicate an
 * entry per region, lookups fall back to the base subtag.
 *
 * Lives in `lib/` because it is genuinely cross-domain: `domains/lexicon`
 * resolves lexical providers and dictionary sources with it, and
 * `domains/lessons` resolves display names and character helpers.
 */

/** `es-MX` → `es`; `es` → `es`; `PT-BR` → `pt`. */
export function baseLanguageSubtag(languageCode: string): string {
  return languageCode.toLowerCase().split("-")[0];
}

/**
 * Resolves a value keyed by language code, trying the full code first so a
 * region can override, then the base subtag.
 */
export function resolveByLanguageCode<T>(
  table: Record<string, T>,
  languageCode: string,
): T | undefined {
  const normalized = languageCode.toLowerCase();
  return table[normalized] ?? table[baseLanguageSubtag(normalized)];
}
