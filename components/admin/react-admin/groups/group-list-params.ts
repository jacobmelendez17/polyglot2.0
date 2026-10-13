/**
 * The URL state of the groups list (spec 26 Unit 5): a language and **a level**,
 * both always present. Groups are read one level at a time — a group's position
 * is its lesson number *within its level*, so a list across levels would show
 * several "lesson 1"s and invite reading them as one sequence.
 *
 * The URL carries both so a view is bookmarkable, survives a refresh, and is
 * exactly what the specialist reorder tool's link and a group page's "back"
 * link point at.
 */

export type GroupListFilters = {
  /** Always present: groups are read in one language. */
  language: string;
  /** The level whose groups are shown; empty only when the language has no levels. */
  level: string;
};

export type GroupListLookups = {
  languages: ReadonlyArray<{ id: string }>;
  /** The levels of the **selected** language (the page resolves it from the same URL), in level order. */
  levels: ReadonlyArray<{ id: string }>;
};

type ParamsLike = { get(name: string): string | null };

/** The page this list lives on — also where "back to the groups" links point. */
export const GROUPS_PATH = "/admin/curriculum/groups";

/**
 * An unknown or missing `language` falls back to the first, and an unknown or
 * missing `level` to the language's first — as the page always did. A level
 * from another language is unknown here (the lookups are the selected
 * language's), so it can never be sent to the API, which would refuse it too.
 *
 * There is no cursor: a level's groups are one bounded response. One in the URL
 * is ignored, and never written back.
 */
export function parseGroupListParams(
  params: ParamsLike,
  lookups: GroupListLookups,
): { filters: GroupListFilters; cursor: undefined } {
  const requestedLanguage = params.get("language");
  const language = lookups.languages.some((l) => l.id === requestedLanguage)
    ? (requestedLanguage as string)
    : (lookups.languages[0]?.id ?? "");

  const requestedLevel = params.get("level");
  const level = lookups.levels.some((l) => l.id === requestedLevel)
    ? (requestedLevel as string)
    : (lookups.levels[0]?.id ?? "");

  return { filters: { language, level }, cursor: undefined };
}

/** The canonical query string for a list state. Empty values are omitted; the order is fixed. */
export function serializeGroupListParams(
  filters: GroupListFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  if (filters.level) params.set("level", filters.level);
  return params;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Applies an edit from the filter form to the previous filters.
 *
 * A level belongs to one language, so **switching language drops the level**
 * (it is not carried over); the new language's first level then becomes the
 * default, when the URL is read again with that language's levels. Neither can
 * be emptied: there is no "all languages" and no "all levels".
 */
export function applyGroupFilterChange(
  previous: GroupListFilters,
  requested: Record<string, unknown>,
): GroupListFilters {
  const language = str(requested.language) ?? previous.language;
  const level =
    language !== previous.language
      ? ""
      : (str(requested.level) ?? previous.level);
  return { language, level };
}

/**
 * Where the specialist reorder tool for this level lives: the same page, in
 * `?mode=reorder`, for the same language and level.
 */
export function reorderHref(filters: GroupListFilters): string {
  const params = serializeGroupListParams(filters);
  params.set("mode", "reorder");
  return `${GROUPS_PATH}?${params.toString()}`;
}

/** The groups list for a language and level — what a group page's "back" link points at. */
export function groupsListHref(filters: GroupListFilters): string {
  const query = serializeGroupListParams(filters).toString();
  return query ? `${GROUPS_PATH}?${query}` : GROUPS_PATH;
}
