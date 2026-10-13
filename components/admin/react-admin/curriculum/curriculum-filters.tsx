"use client";

import { useMemo } from "react";
import {
  FilterForm,
  SelectInput,
  TextInput,
  required,
  useListContext,
} from "react-admin";

import {
  CURRICULUM_ITEM_TYPES,
  CURRICULUM_NEEDS_FILTERS,
  CURRICULUM_STATUSES,
} from "@/domains/admin";

export type CurriculumFilterLookups = {
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
};

const TYPE_LABEL: Record<(typeof CURRICULUM_ITEM_TYPES)[number], string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
};

const STATUS_LABEL: Record<(typeof CURRICULUM_STATUSES)[number], string> = {
  draft: "Draft",
  pending: "Pending",
  published: "Published",
  archived: "Archived",
};

/** Spec 25 §15's editorial work queue. Only values with real data behind them: see `CURRICULUM_NEEDS_FILTERS`. */
const NEEDS_LABEL: Record<(typeof CURRICULUM_NEEDS_FILTERS)[number], string> = {
  definition: "Needs Definition",
  examples: "Needs Examples",
  ipa: "Needs IPA",
  pronunciation: "Needs Pronunciation",
  synonyms: "Needs Synonyms",
  variations: "Needs Variations",
  draft_changes: "Has Draft Changes",
  ready_to_publish: "Ready to Publish",
};

/** Every filter is always shown, never hidden behind an "add filter" menu: this is a small, fixed set an editor scans at a glance. */
const SHARED = { alwaysOn: true, helperText: false, size: "small" } as const;

/** Full width on a phone (as the filter bar this replaces was), a fixed width beside its neighbours from `sm` up. */
const width = (sm: number) => ({ sx: { width: { xs: "100%", sm } } }) as const;

/**
 * The list's search and filters, as React Admin filter inputs (spec 26 Unit 2).
 *
 * `FilterForm` reads and writes the surrounding `ListContext`: its values come
 * from the URL (see `useCurriculumList`), and an edit goes back out through
 * `setFilters`, which navigates. Typing in search is debounced by React Admin
 * (500 ms), then replaces the URL rather than stacking history entries.
 *
 * Behaviour carried over from the filter bar this replaces: the Group choices
 * are scoped to the selected Level, a language switch clears Level and Group,
 * and changing Level clears Group (all enforced in
 * `applyCurriculumFilterChange`, not here).
 */
export function CurriculumFilters({
  languages,
  levels,
  groups,
}: CurriculumFilterLookups) {
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
    <div role="search" aria-label="Filter curriculum">
      <FilterForm
        filters={[
          <TextInput
            key="search"
            source="search"
            label="Search curriculum"
            type="search"
            resettable
            {...SHARED}
            {...width(240)}
          />,
          // Required, so there is no "all languages" option: curriculum is
          // always browsed one language at a time.
          <SelectInput
            key="language"
            source="language"
            label="Language"
            choices={languages}
            validate={required()}
            {...SHARED}
            {...width(150)}
          />,
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
            key="type"
            source="type"
            label="Type"
            choices={CURRICULUM_ITEM_TYPES.map((id) => ({
              id,
              name: TYPE_LABEL[id],
            }))}
            emptyText="All types"
            {...SHARED}
            {...width(130)}
          />,
          <SelectInput
            key="status"
            source="status"
            label="Status"
            choices={CURRICULUM_STATUSES.map((id) => ({
              id,
              name: STATUS_LABEL[id],
            }))}
            emptyText="All statuses"
            {...SHARED}
            {...width(150)}
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
            key="needs"
            source="needs"
            label="Needs"
            choices={CURRICULUM_NEEDS_FILTERS.map((id) => ({
              id,
              name: NEEDS_LABEL[id],
            }))}
            emptyText="Editorial work queue"
            {...SHARED}
            {...width(200)}
          />,
        ]}
      />
    </div>
  );
}
