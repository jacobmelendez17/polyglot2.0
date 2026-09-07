import Link from "next/link";
import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MappingFilters } from "@/components/admin/dictionary/mapping-filters";
import { MappingQueueTableSection } from "@/components/admin/dictionary/mapping-queue-table-section";
import { canManageCurriculum } from "@/domains/admin";
import { getLanguages, getLevelsByLanguage, getVocabularyGroupsByLanguage } from "@/domains/curriculum/server";
import { MATCH_STATUS_LABELS, getLexicalLanguageProvider } from "@/domains/lexicon";
import type { DictionaryMatchStatus, RegionalEvidenceStatus } from "@/domains/lexicon";
import { getMappingQueue, getMappingStatusCounts } from "@/domains/lexicon/server";
import { requireUser } from "@/domains/users/server";

export const metadata: Metadata = {
  title: "Dictionary — Polyglot Admin",
};

const PAGE_SIZE = 25;

const MATCH_STATUSES: DictionaryMatchStatus[] = [
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "review_required",
  "manual",
];
const REGIONAL_STATUSES: RegionalEvidenceStatus[] = ["recognized", "not_listed", "unknown"];

// The parts of speech an admin can filter by. Curriculum stores this as free
// text, so this is the set the editors actually offer rather than a
// database-derived list — a `SELECT DISTINCT` over every item would grow
// unboundedly with typos.
const PART_OF_SPEECH_OPTIONS = ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "phrase"];

type SearchParams = {
  language?: string;
  level?: string;
  group?: string;
  status?: string;
  pos?: string;
  region?: string;
  regional?: string;
  offset?: string;
};

/**
 * Spec 12 "Admin Mapping Review" — the mapping queue. Admin only, re-checked
 * here independently of the layout's broader area check, since a developer
 * without the admin role is admitted to `/admin` but not to curriculum
 * surfaces (spec 11 §4).
 *
 * Read-only by design: the queue finds work and links to the item editor,
 * where the mapping panel owns every mutation. One place that changes a
 * mapping, not two.
 */
export default async function AdminDictionaryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canManageCurriculum(user)) forbidden();

  const params = await searchParams;
  const languages = await getLanguages();

  if (languages.length === 0) {
    return (
      <div>
        <AdminPageHeader title="Dictionary" description="Review how curriculum vocabulary maps onto dictionary entries." />
        <p className="text-sm text-muted-foreground">No languages are configured yet.</p>
      </div>
    );
  }

  const language = languages.find((candidate) => candidate.id === params.language) ?? languages[0]!;
  const provider = getLexicalLanguageProvider(language.code);
  const matchStatus = MATCH_STATUSES.includes(params.status as DictionaryMatchStatus)
    ? (params.status as DictionaryMatchStatus)
    : undefined;
  const regionalStatus = REGIONAL_STATUSES.includes(params.regional as RegionalEvidenceStatus)
    ? (params.regional as RegionalEvidenceStatus)
    : undefined;
  const regionCode =
    params.region && provider.regionCodes.includes(params.region) ? params.region : (provider.regionCodes[0] ?? null);
  const partOfSpeech = PART_OF_SPEECH_OPTIONS.includes(params.pos ?? "") ? params.pos : undefined;
  const parsedOffset = Number.parseInt(params.offset ?? "0", 10);
  const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

  const [levels, groups, counts, page] = await Promise.all([
    getLevelsByLanguage(language.id),
    getVocabularyGroupsByLanguage(language.id),
    getMappingStatusCounts(language.id),
    getMappingQueue({
      languageId: language.id,
      levelId: params.level || undefined,
      vocabularyGroupId: params.group || undefined,
      matchStatus,
      partOfSpeech,
      regionCode: regionCode ?? undefined,
      regionalStatus,
      limit: PAGE_SIZE,
      offset,
    }),
  ]);

  const levelNumberById = new Map(levels.map((level) => [level.id, level.levelNumber]));
  const groupOptions = groups
    .map((group) => ({ id: group.id, name: group.name, levelNumber: levelNumberById.get(group.levelId) ?? 0 }))
    .sort((a, b) => a.levelNumber - b.levelNumber || a.name.localeCompare(b.name));

  function pageHref(nextOffset: number): string {
    const next = new URLSearchParams();
    next.set("language", language.id);
    if (params.level) next.set("level", params.level);
    if (params.group) next.set("group", params.group);
    if (matchStatus) next.set("status", matchStatus);
    if (partOfSpeech) next.set("pos", partOfSpeech);
    if (regionCode) next.set("region", regionCode);
    if (regionalStatus) next.set("regional", regionalStatus);
    if (nextOffset > 0) next.set("offset", String(nextOffset));
    return `/admin/dictionary?${next.toString()}`;
  }

  const shownFrom = page.total === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + PAGE_SIZE, page.total);

  return (
    <div>
      <AdminPageHeader
        title="Dictionary"
        description="Review how curriculum vocabulary maps onto imported dictionary entries."
      />

      <dl className="mb-4 flex flex-wrap gap-4 text-sm">
        {MATCH_STATUSES.map((status) => (
          <div key={status} className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{MATCH_STATUS_LABELS[status]}</dt>
            <dd className="font-medium text-foreground">{counts[status]}</dd>
          </div>
        ))}
        {counts.no_mapping > 0 ? (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">Never matched</dt>
            <dd className="font-medium text-foreground">{counts.no_mapping}</dd>
          </div>
        ) : null}
      </dl>

      <MappingFilters
        languages={languages.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
        levels={levels.map((level) => ({ id: level.id, levelNumber: level.levelNumber }))}
        groups={groupOptions}
        partsOfSpeech={PART_OF_SPEECH_OPTIONS}
        regionCodes={[...provider.regionCodes]}
        value={{
          languageId: language.id,
          levelId: params.level || undefined,
          groupId: params.group || undefined,
          matchStatus,
          partOfSpeech,
          regionCode: regionCode ?? undefined,
          regionalStatus,
        }}
      />

      <MappingQueueTableSection rows={page.rows} regionCode={regionCode} />

      {page.total > PAGE_SIZE ? (
        <nav aria-label="Mapping queue pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {shownFrom}–{shownTo} of {page.total}
          </p>
          <div className="flex items-center gap-2">
            {offset > 0 ? (
              <Link
                href={pageHref(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Previous
              </Link>
            ) : null}
            {shownTo < page.total ? (
              <Link
                href={pageHref(offset + PAGE_SIZE)}
                className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
