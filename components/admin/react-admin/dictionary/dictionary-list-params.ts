import {
  DICTIONARY_LIST_PAGE_SIZE,
  MAPPING_MATCH_STATUSES,
  MAPPING_PARTS_OF_SPEECH,
  MAPPING_REGIONAL_STATUSES,
  type AdminMappingMatchStatus,
  type AdminMappingRegionalStatus,
} from "@/domains/admin";

import type { OffsetListCodec } from "../use-offset-list";

/**
 * The dictionary mapping queue's state, and how it maps to and from the page's
 * real URL (spec 26 Unit 9). The URL is the single source of truth — a filtered
 * queue is bookmarkable and survives a refresh — so nothing here lives in React
 * Admin's own router or store.
 *
 * The parameter names and their serialized order are the ones the page always
 * used (`language, level, group, status, pos, region, regional`, then
 * `offset`), so links already in circulation keep working.
 */

export type DictionaryListFilters = {
  /** Always present: the queue is read one language at a time. */
  language: string;
  level?: string;
  group?: string;
  status?: AdminMappingMatchStatus;
  pos?: (typeof MAPPING_PARTS_OF_SPEECH)[number];
  /** A region the language's dictionary covers; absent means its first. */
  region?: string;
  regional?: AdminMappingRegionalStatus;
};

export type DictionaryListLookups = {
  languages: ReadonlyArray<{ id: string }>;
  /** The selected language's levels and groups — never another language's. */
  levels: ReadonlyArray<{ id: string }>;
  groups: ReadonlyArray<{ id: string }>;
  /** The regions the selected language's dictionary covers. */
  regionCodes: ReadonlyArray<string>;
};

type ParamsLike = { get(name: string): string | null };

function oneOf<T extends string>(
  allowed: readonly T[],
  value: string | null | undefined,
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Reads the queue's state out of a URL's search params, discarding anything it
 * cannot honour — the same tolerance the server page always had.
 *
 * - An unknown or missing `language` falls back to the first language.
 * - A `status`, `pos` or `regional` outside its whitelist is dropped.
 * - A `level`, `group` or `region` that is not in the supplied lookups (the
 *   *selected language's*) is dropped, so another language's can never be sent.
 * - `offset` is rounded down to a whole page and never negative.
 */
export function parseDictionaryListParams(
  params: ParamsLike,
  lookups: DictionaryListLookups,
): { filters: DictionaryListFilters; offset: number } {
  const requestedLanguage = params.get("language");
  const language = lookups.languages.some((l) => l.id === requestedLanguage)
    ? (requestedLanguage as string)
    : (lookups.languages[0]?.id ?? "");

  const level = params.get("level");
  const group = params.get("group");
  const region = params.get("region");

  const parsedOffset = Number.parseInt(params.get("offset") ?? "0", 10);
  const offset =
    Number.isFinite(parsedOffset) && parsedOffset > 0
      ? parsedOffset - (parsedOffset % DICTIONARY_LIST_PAGE_SIZE)
      : 0;

  return {
    filters: {
      language,
      level: lookups.levels.some((l) => l.id === level)
        ? (level as string)
        : undefined,
      group: lookups.groups.some((g) => g.id === group)
        ? (group as string)
        : undefined,
      status: oneOf(MAPPING_MATCH_STATUSES, params.get("status")),
      pos: oneOf(MAPPING_PARTS_OF_SPEECH, params.get("pos")),
      region: lookups.regionCodes.includes(region ?? "")
        ? (region as string)
        : undefined,
      regional: oneOf(MAPPING_REGIONAL_STATUSES, params.get("regional")),
    },
    offset,
  };
}

/** The canonical query string for a queue state. Empty values are omitted; the order is fixed. */
export function serializeDictionaryListParams(
  filters: DictionaryListFilters,
  offset?: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.language) params.set("language", filters.language);
  if (filters.level) params.set("level", filters.level);
  if (filters.group) params.set("group", filters.group);
  if (filters.status) params.set("status", filters.status);
  if (filters.pos) params.set("pos", filters.pos);
  if (filters.region) params.set("region", filters.region);
  if (filters.regional) params.set("regional", filters.regional);
  if (offset && offset > 0) params.set("offset", String(offset));
  return params;
}

/**
 * Applies a filter edit from the filter form to the previous filters.
 *
 * Two dependent resets, kept from the filter bar this replaces: changing
 * **language** clears level, group and region (they belong to the old one), and
 * changing **level** clears group (a group from another level no longer
 * applies). The region is not an input of the form — it follows the language —
 * so an edit keeps it. The offset is never carried over: it only means
 * something under the filters that produced it.
 */
export function applyDictionaryFilterChange(
  previous: DictionaryListFilters,
  requested: Record<string, unknown>,
): DictionaryListFilters {
  const language = str(requested.language) ?? previous.language;
  const languageChanged = language !== previous.language;

  const level = languageChanged ? undefined : str(requested.level);
  const levelChanged = level !== previous.level;

  return {
    language,
    level,
    group: languageChanged || levelChanged ? undefined : str(requested.group),
    status: oneOf(MAPPING_MATCH_STATUSES, str(requested.status)),
    pos: oneOf(MAPPING_PARTS_OF_SPEECH, str(requested.pos)),
    region: languageChanged ? undefined : previous.region,
    regional: oneOf(MAPPING_REGIONAL_STATUSES, str(requested.regional)),
  };
}

/** Whether any filter beyond the mandatory language is in effect — which decides between "nothing yet" and "nothing matches". */
export function hasActiveDictionaryFilters(
  filters: DictionaryListFilters,
): boolean {
  return Boolean(
    filters.level ||
    filters.group ||
    filters.status ||
    filters.pos ||
    filters.regional,
  );
}

export function dictionaryListCodec(
  lookups: DictionaryListLookups,
): OffsetListCodec<DictionaryListFilters> {
  return {
    parse: (params) => parseDictionaryListParams(params, lookups),
    serialize: serializeDictionaryListParams,
    applyChange: applyDictionaryFilterChange,
  };
}
