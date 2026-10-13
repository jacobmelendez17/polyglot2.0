/**
 * The URL state of a list whose only filter is a language (spec 26 Units 3-4:
 * the review queue and the levels list) — the smallest instance of the codec
 * `useCursorList` takes. Lists with more filters (the curriculum list) have
 * their own.
 */

export type LanguageListFilters = {
  /** Always present: these lists are read one language at a time. */
  language: string;
};

export type LanguageListLookups = {
  languages: ReadonlyArray<{ id: string }>;
};

type ParamsLike = { get(name: string): string | null };

/**
 * An unknown or missing `language` falls back to the first, as the pages
 * always did; an empty cursor means no cursor.
 */
export function parseLanguageListParams(
  params: ParamsLike,
  lookups: LanguageListLookups,
): { filters: LanguageListFilters; cursor: string | undefined } {
  const requested = params.get("language");
  const language = lookups.languages.some((l) => l.id === requested)
    ? (requested as string)
    : (lookups.languages[0]?.id ?? "");
  return { filters: { language }, cursor: params.get("cursor") || undefined };
}

export function serializeLanguageListParams(
  filters: LanguageListFilters,
  cursor?: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  if (cursor) params.set("cursor", cursor);
  return params;
}

/**
 * Switching language is the only edit, and it starts a new view: a cursor is
 * only meaningful under the language that produced it, so it is never carried
 * over. The mandatory language can never be emptied.
 */
export function applyLanguageFilterChange(
  previous: LanguageListFilters,
  requested: Record<string, unknown>,
): LanguageListFilters {
  const language =
    typeof requested.language === "string" && requested.language !== ""
      ? requested.language
      : previous.language;
  return { language };
}
