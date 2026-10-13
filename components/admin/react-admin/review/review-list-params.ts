/**
 * The review queue's URL state: a language and a cursor, nothing else. The
 * queue has no filters of its own — it is "everything waiting" — so this is
 * the smallest instance of the codec `useCursorList` takes.
 */

export type ReviewListFilters = {
  /** Always present: the queue is read one language at a time. */
  language: string;
};

export type ReviewListLookups = {
  languages: ReadonlyArray<{ id: string }>;
};

type ParamsLike = { get(name: string): string | null };

/**
 * An unknown or missing `language` falls back to the first, as the page
 * always did; an empty cursor means no cursor.
 */
export function parseReviewListParams(
  params: ParamsLike,
  lookups: ReviewListLookups,
): { filters: ReviewListFilters; cursor: string | undefined } {
  const requested = params.get("language");
  const language = lookups.languages.some((l) => l.id === requested)
    ? (requested as string)
    : (lookups.languages[0]?.id ?? "");
  return { filters: { language }, cursor: params.get("cursor") || undefined };
}

export function serializeReviewListParams(
  filters: ReviewListFilters,
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
export function applyReviewFilterChange(
  previous: ReviewListFilters,
  requested: Record<string, unknown>,
): ReviewListFilters {
  const language =
    typeof requested.language === "string" && requested.language !== ""
      ? requested.language
      : previous.language;
  return { language };
}
