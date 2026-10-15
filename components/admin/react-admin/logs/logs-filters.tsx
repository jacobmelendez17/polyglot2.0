"use client";

import { DateInput, FilterForm, SelectInput, TextInput } from "react-admin";

import { ADMIN_AUDIT_ACTIONS } from "@/domains/admin";

/** Every filter is always shown, never hidden behind an "add filter" menu: this is a small, fixed set someone investigating scans at a glance. */
const SHARED = { alwaysOn: true, helperText: false, size: "small" } as const;

/** Full width on a phone, a fixed width beside its neighbours from `sm` up. */
const width = (sm: number) => ({ sx: { width: { xs: "100%", sm } } }) as const;

/**
 * The audit log's filters, as React Admin filter inputs: actor, action,
 * resource type and id, and a date range. `FilterForm` reads and writes the
 * surrounding `ListContext` — its values come from the URL (see `useLogsList`)
 * and an edit goes back out through `setFilters`, which cleans them and
 * navigates (a half-typed actor id is simply not a filter yet).
 *
 * The actor and resource boxes take a raw id: there is no "list the staff" read
 * model to build a picker from, and inventing one is not this screen's job.
 */
export function LogsFilters() {
  return (
    // `FilterForm` forwards unknown props into react-hook-form's options, not
    // onto the <form>, so the landmark is a wrapper, not an `aria-label`.
    <div role="search" aria-label="Filter the audit log">
      <FilterForm
        filters={[
          <TextInput
            key="actor"
            source="actor"
            label="Actor ID"
            resettable
            {...SHARED}
            {...width(250)}
          />,
          <SelectInput
            key="action"
            source="action"
            label="Action"
            choices={ADMIN_AUDIT_ACTIONS.map((id) => ({ id, name: id }))}
            emptyText="All actions"
            {...SHARED}
            {...width(270)}
          />,
          <TextInput
            key="resourceType"
            source="resourceType"
            label="Resource type"
            resettable
            {...SHARED}
            {...width(170)}
          />,
          <TextInput
            key="resourceId"
            source="resourceId"
            label="Resource ID"
            resettable
            {...SHARED}
            {...width(250)}
          />,
          <DateInput
            key="from"
            source="from"
            label="From date"
            {...SHARED}
            {...width(160)}
          />,
          <DateInput
            key="to"
            source="to"
            label="To date"
            {...SHARED}
            {...width(160)}
          />,
        ]}
      />
    </div>
  );
}
