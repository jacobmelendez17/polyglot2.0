import {
  CURRICULUM_ITEM_TYPES,
  CURRICULUM_NEEDS_FILTERS,
  CURRICULUM_STATUSES,
} from "@/domains/admin";

/**
 * The Admin curriculum list's state, and how it maps to and from the page's
 * real URL (spec 26 Unit 2). The URL is the single source of truth — a
 * filtered view is bookmarkable, survives a refresh, and is what the item
 * editor's `?from=` carries back — so nothing here lives in React Admin's own
 * router or store.
 *
 * The parameter names and their serialized order are deliberately the ones the
 * pre-migration page used (`language, level, type, status, group, search,
 * needs`, then `cursor`), so links already in circulation keep working.
 */

export type CurriculumListFilters = {
  /** Always present: curriculum browsing is scoped to exactly one language. */
  language: string;
  level?: string;
  type?: (typeof CURRICULUM_ITEM_TYPES)[number];
  status?: (typeof CURRICULUM_STATUSES)[number];
  group?: string;
  search?: string;
  needs?: (typeof CURRICULUM_NEEDS_FILTERS)[number];
};

export type CurriculumListLookups = {
  languages: ReadonlyArray<{ id: string }>;
  levels: ReadonlyArray<{ id: string }>;
  groups: ReadonlyArray<{ id: string }>;
};

export type CurriculumListState = {
  filters: CurriculumListFilters;
  /** Opaque keyset cursor of the page being shown; absent on the first page. */
  cursor: string | undefined;
};

type ParamsLike = { get(name: string): string | null };

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function present(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

/**
 * Reads the list state out of a URL's search params, discarding anything this
 * list cannot honour — the same tolerance the server page always had.
 *
 * - An unknown or missing `language` falls back to the first language.
 * - An enum value (`type`, `status`, `needs`) outside its whitelist is dropped.
 * - A `level` or `group` that is not in the supplied lookups is dropped. The
 *   lookups are the *selected language's*, so a level/group from another
 *   language can never be sent to the API (which rejects it, too).
 */
export function parseCurriculumListParams(
  params: ParamsLike,
  lookups: CurriculumListLookups,
): CurriculumListState {
  const requestedLanguage = params.get("language");
  const language = lookups.languages.some((l) => l.id === requestedLanguage)
    ? (requestedLanguage as string)
    : (lookups.languages[0]?.id ?? "");

  const level = params.get("level");
  const group = params.get("group");

  return {
    filters: {
      language,
      level: lookups.levels.some((l) => l.id === level)
        ? (level as string)
        : undefined,
      type: oneOf(CURRICULUM_ITEM_TYPES, params.get("type")),
      status: oneOf(CURRICULUM_STATUSES, params.get("status")),
      group: lookups.groups.some((g) => g.id === group)
        ? (group as string)
        : undefined,
      search: present(params.get("search")?.trim()),
      needs: oneOf(CURRICULUM_NEEDS_FILTERS, params.get("needs")),
    },
    cursor: present(params.get("cursor")),
  };
}

/** The canonical query string for a list state. Empty values are omitted; the order is fixed. */
export function serializeCurriculumListParams(
  filters: CurriculumListFilters,
  cursor?: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  if (filters.level) params.set("level", filters.level);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  if (filters.group) params.set("group", filters.group);
  if (filters.search) params.set("search", filters.search);
  if (filters.needs) params.set("needs", filters.needs);
  if (cursor) params.set("cursor", cursor);
  return params;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Applies a filter edit from the filter form to the previous filters, and
 * returns the new filters the URL should carry.
 *
 * Two dependent resets, kept from the pre-migration filter bar:
 * - changing **language** clears level and group (they belong to the old one);
 * - changing **level** clears group (a group from another level no longer
 *   applies, and would otherwise linger as a hidden, unselectable filter).
 *
 * The cursor is never carried over: a cursor is only meaningful under the
 * exact filters that produced it, so any filter change starts at page one.
 * Unrecognised keys in `requested` are ignored, never forwarded.
 */
export function applyCurriculumFilterChange(
  previous: CurriculumListFilters,
  requested: Record<string, unknown>,
): CurriculumListFilters {
  const language = str(requested.language) ?? previous.language;
  const languageChanged = language !== previous.language;

  const level = languageChanged ? undefined : str(requested.level);
  const levelChanged = level !== previous.level;

  return {
    language,
    level,
    type: oneOf(CURRICULUM_ITEM_TYPES, str(requested.type)),
    status: oneOf(CURRICULUM_STATUSES, str(requested.status)),
    group: languageChanged || levelChanged ? undefined : str(requested.group),
    search: str(requested.search)?.trim() || undefined,
    needs: oneOf(CURRICULUM_NEEDS_FILTERS, str(requested.needs)),
  };
}

/** Whether any filter beyond the mandatory language is in effect — which decides between "nothing yet" and "nothing matches". */
export function hasActiveFilters(filters: CurriculumListFilters): boolean {
  return Boolean(
    filters.level ||
    filters.type ||
    filters.status ||
    filters.group ||
    filters.search ||
    filters.needs,
  );
}

/** Whether two states are the same URL — used to avoid navigating to where we already are. */
export function sameListState(
  a: CurriculumListState,
  b: CurriculumListState,
): boolean {
  return (
    serializeCurriculumListParams(a.filters, a.cursor).toString() ===
    serializeCurriculumListParams(b.filters, b.cursor).toString()
  );
}
