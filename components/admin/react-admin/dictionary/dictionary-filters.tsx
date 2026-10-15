"use client";

import { useMemo } from "react";
import { FilterForm, SelectInput, required, useListContext } from "react-admin";

import {
  MAPPING_MATCH_STATUSES,
  MAPPING_PARTS_OF_SPEECH,
  MAPPING_REGIONAL_STATUSES,
} from "@/domains/admin";
import { MATCH_STATUS_LABELS, REGIONAL_STATUS_LABELS } from "@/domains/lexicon";

export type DictionaryFilterLookups = {
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
  /** The region the regional filter speaks about; `null` when the language has none, and the filter is not offered. */
  regionCode: string | null;
};

/** Where work is first: the states that need a person lead the list, as they always have. */
const STATUS_ORDER = [
  "review_required",
  "unmatched",
  "source_data_not_imported",
  "auto_matched",
  "manual",
] as const satisfies readonly (typeof MAPPING_MATCH_STATUSES)[number][];

/** Every filter is always shown, never hidden behind an "add filter" menu: this is a small, fixed set an editor scans at a glance. */
const SHARED = { alwaysOn: true, helperText: false, size: "small" } as const;

/** Full width on a phone, a fixed width beside its neighbours from `sm` up. */
const width = (sm: number) => ({ sx: { width: { xs: "100%", sm } } }) as const;

/**
 * The mapping queue's filters, as React Admin filter inputs (spec 26 Unit 9):
 * level, group, match state, part of speech, and regional status — plus a
 * language switch when there is more than one.
 *
 * `FilterForm` reads and writes the surrounding `ListContext`: its values come
 * from the URL (see `useDictionaryList`) and an edit goes back out through
 * `setFilters`, which navigates and returns to the first page.
 *
 * Carried over from the bar this replaces: the group choices are scoped to the
 * selected level, a language switch clears level and group, and changing level
 * clears group (all enforced in `applyDictionaryFilterChange`, not here).
 */
export function DictionaryFilters({
  languages,
  levels,
  groups,
  regionCode,
}: DictionaryFilterLookups) {
  const { filterValues } = useListContext();

  const selectedLevelNumber = levels.find(
    (level) => level.id === filterValues.level,
  )?.levelNumber;

  const groupChoices = useMemo(
    () =>
      groups
        .filter(
          (group) =>
            selectedLevelNumber === undefined ||
            group.levelNumber === selectedLevelNumber,
        )
        .map((group) => ({
          id: group.id,
          // With no level chosen, groups from every level are listed, so say which.
          name:
            selectedLevelNumber === undefined
              ? `L${group.levelNumber} — ${group.name}`
              : group.name,
        })),
    [groups, selectedLevelNumber],
  );

  return (
    // `FilterForm` forwards unknown props into react-hook-form's options, not
    // onto the <form>, so the landmark is a wrapper, not an `aria-label`.
    <div role="search" aria-label="Filter dictionary queue">
      <FilterForm
        filters={[
          // Required, so there is no "all languages" option; offered only when
          // there is a choice to make.
          ...(languages.length > 1
            ? [
                <SelectInput
                  key="language"
                  source="language"
                  label="Language"
                  choices={languages}
                  validate={required()}
                  {...SHARED}
                  {...width(150)}
                />,
              ]
            : []),
          <SelectInput
            key="level"
            source="level"
            label="Level"
            choices={levels.map((level) => ({
              id: level.id,
              name: `Level ${level.levelNumber}`,
            }))}
            emptyText="All levels"
            {...SHARED}
            {...width(130)}
          />,
          <SelectInput
            key="group"
            source="group"
            label="Group"
            choices={groupChoices}
            emptyText="All groups"
            {...SHARED}
            {...width(200)}
          />,
          <SelectInput
            key="status"
            source="status"
            label="Match state"
            choices={STATUS_ORDER.map((id) => ({
              id,
              name: MATCH_STATUS_LABELS[id],
            }))}
            emptyText="All match states"
            {...SHARED}
            {...width(190)}
          />,
          <SelectInput
            key="pos"
            source="pos"
            label="Part of speech"
            choices={MAPPING_PARTS_OF_SPEECH.map((id) => ({ id, name: id }))}
            emptyText="All parts of speech"
            {...SHARED}
            {...width(190)}
          />,
          ...(regionCode
            ? [
                <SelectInput
                  key="regional"
                  source="regional"
                  label={`Regional status in ${regionCode}`}
                  choices={MAPPING_REGIONAL_STATUSES.map((id) => ({
                    id,
                    name: `${REGIONAL_STATUS_LABELS[id]} in ${regionCode}`,
                  }))}
                  emptyText="All regional states"
                  {...SHARED}
                  {...width(230)}
                />,
              ]
            : []),
        ]}
      />
    </div>
  );
}
