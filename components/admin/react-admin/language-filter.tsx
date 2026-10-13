"use client";

import { FilterForm, SelectInput, required } from "react-admin";

/**
 * The language switch for a list read one language at a time (the review
 * queue, the levels list) — shown only when there is more than one language to
 * switch between. A lone-option control that can never change anything is just
 * noise; the `?language=` URL parameter works either way.
 *
 * `label` names the search region for assistive technology
 * ("Filter review queue"), since the control itself is just "Language".
 */
export function LanguageFilter({
  languages,
  label,
}: {
  languages: { id: string; name: string }[];
  label: string;
}) {
  if (languages.length < 2) return null;

  return (
    <div role="search" aria-label={label}>
      <FilterForm
        filters={[
          <SelectInput
            key="language"
            source="language"
            label="Language"
            choices={languages}
            // Required, so there is no "all languages" option.
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
