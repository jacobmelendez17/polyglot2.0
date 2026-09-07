"use client";

import { usePathname, useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MATCH_STATUS_LABELS, REGIONAL_STATUS_LABELS } from "@/domains/lexicon";
import type { DictionaryMatchStatus, RegionalEvidenceStatus } from "@/domains/lexicon";

const ALL_VALUE = "all";

const MATCH_STATUS_OPTIONS: DictionaryMatchStatus[] = [
  "review_required",
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "manual",
];

const REGIONAL_STATUS_OPTIONS: RegionalEvidenceStatus[] = ["recognized", "not_listed", "unknown"];

type MappingFiltersProps = {
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  partsOfSpeech: string[];
  regionCodes: string[];
  value: {
    languageId: string;
    levelId?: string;
    groupId?: string;
    matchStatus?: DictionaryMatchStatus;
    partOfSpeech?: string;
    regionCode?: string;
    regionalStatus?: RegionalEvidenceStatus;
  };
};

/**
 * Spec 12 "Admin Mapping Review" filters: Level, group, match state, POS,
 * regional status. Filter state is navigable URL state, matching
 * `CurriculumFilters` — a filtered queue is bookmarkable and survives a
 * refresh, and changing any filter returns to the first page.
 */
export function MappingFilters({ languages, levels, groups, partsOfSpeech, regionCodes, value }: MappingFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(overrides: Partial<MappingFiltersProps["value"]>) {
    const next = { ...value, ...overrides };
    const params = new URLSearchParams();
    if (next.languageId) params.set("language", next.languageId);
    if (next.levelId) params.set("level", next.levelId);
    if (next.groupId) params.set("group", next.groupId);
    if (next.matchStatus) params.set("status", next.matchStatus);
    if (next.partOfSpeech) params.set("pos", next.partOfSpeech);
    if (next.regionCode) params.set("region", next.regionCode);
    if (next.regionalStatus) params.set("regional", next.regionalStatus);
    router.push(`${pathname}?${params.toString()}`);
  }

  const groupOptions = value.levelId
    ? groups.filter((group) => levels.find((level) => level.id === value.levelId)?.levelNumber === group.levelNumber)
    : groups;

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {languages.length > 1 ? (
        <Select value={value.languageId} onValueChange={(languageId) => navigate({ languageId })}>
          <SelectTrigger className="sm:w-40" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((language) => (
              <SelectItem key={language.id} value={language.id}>
                {language.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={value.levelId ?? ALL_VALUE}
        onValueChange={(levelId) => navigate({ levelId: levelId === ALL_VALUE ? undefined : levelId, groupId: undefined })}
      >
        <SelectTrigger className="sm:w-36" aria-label="Level">
          <SelectValue placeholder="All levels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All levels</SelectItem>
          {levels.map((level) => (
            <SelectItem key={level.id} value={level.id}>
              Level {level.levelNumber}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.groupId ?? ALL_VALUE}
        onValueChange={(groupId) => navigate({ groupId: groupId === ALL_VALUE ? undefined : groupId })}
      >
        <SelectTrigger className="sm:w-40" aria-label="Group">
          <SelectValue placeholder="All groups" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All groups</SelectItem>
          {groupOptions.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.matchStatus ?? ALL_VALUE}
        onValueChange={(status) =>
          navigate({ matchStatus: status === ALL_VALUE ? undefined : (status as DictionaryMatchStatus) })
        }
      >
        <SelectTrigger className="sm:w-44" aria-label="Match state">
          <SelectValue placeholder="All match states" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All match states</SelectItem>
          {MATCH_STATUS_OPTIONS.map((status) => (
            <SelectItem key={status} value={status}>
              {MATCH_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.partOfSpeech ?? ALL_VALUE}
        onValueChange={(pos) => navigate({ partOfSpeech: pos === ALL_VALUE ? undefined : pos })}
      >
        <SelectTrigger className="sm:w-44" aria-label="Part of speech">
          <SelectValue placeholder="All parts of speech" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All parts of speech</SelectItem>
          {partsOfSpeech.map((pos) => (
            <SelectItem key={pos} value={pos}>
              {pos}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {regionCodes.length > 0 ? (
        <Select
          value={value.regionalStatus ?? ALL_VALUE}
          onValueChange={(regional) =>
            navigate({
              regionalStatus: regional === ALL_VALUE ? undefined : (regional as RegionalEvidenceStatus),
              // The regional filter is meaningless without a region to
              // filter within, so selecting one pins the primary region.
              regionCode: regional === ALL_VALUE ? value.regionCode : (value.regionCode ?? regionCodes[0]),
            })
          }
        >
          <SelectTrigger className="sm:w-44" aria-label={`Regional status in ${value.regionCode ?? regionCodes[0]}`}>
            <SelectValue placeholder="All regional states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All regional states</SelectItem>
            {REGIONAL_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {REGIONAL_STATUS_LABELS[status]} in {value.regionCode ?? regionCodes[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
