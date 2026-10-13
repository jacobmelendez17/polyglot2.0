"use client";

import { FilterForm, SelectInput, required } from "react-admin";

/**
 * The language switch — shown only when there is more than one language to
 * switch between. The queue has no other filter, and a lone-option control
 * that can never change anything is just noise. The `?language=` URL
 * parameter works either way.
 */
export function ReviewFilters({
  languages,
}: {
  languages: { id: string; name: string }[];
}) {
  if (languages.length < 2) return null;

  return (
    <div role="search" aria-label="Filter review queue">
      <FilterForm
        filters={[
          <SelectInput
            key="language"
            source="language"
            label="Language"
            choices={languages}
            // Required, so there is no "all languages" option: the queue is
            // read one language at a time.
            validate={required()}
            alwaysOn
            helperText={false}
            size="small"
            sx={{ width: { xs: "100%", sm: 200 } }}
          />,
        ]}
      />
    </div>
  );
}
