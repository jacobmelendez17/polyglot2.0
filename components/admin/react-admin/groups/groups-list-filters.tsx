"use client";

import { FilterForm, SelectInput, required } from "react-admin";
import Box from "@mui/material/Box";

/**
 * The groups list's two scopes, as React Admin filter inputs (spec 26 Unit 5):
 * a language (offered only when there is more than one — a lone option can never
 * change anything) and a level.
 *
 * Both are **required**: there is no "all languages" and, deliberately, no "all
 * levels" — a group's position is its lesson number *within its level*, so the
 * list is always one level's. The level choices are the selected language's
 * (the page supplies them from the same URL); a language with no levels has
 * nothing to choose, so the control is not shown.
 *
 * `FilterForm` reads and writes the surrounding `ListContext`: its values come
 * from the URL and an edit goes back out through `setFilters`, which navigates.
 * The dependent rule (a language switch drops the level) lives in
 * `applyGroupFilterChange`, not here.
 *
 * **Why two forms, not one.** React Admin's filter form refuses to re-sync
 * itself from the URL the first time the URL changes after the *person* edited
 * it (so a delayed value cannot overwrite what they just typed). A language
 * switch is exactly such an edit — and it also changes the level, a field the
 * person did not touch. In one form that change is swallowed: the Level select
 * keeps the old language's level, which is not among its choices, and shows
 * blank while the list beneath it is (correctly) another level's. With a form of
 * its own, the Level select has not been edited by the person, so it follows
 * the URL.
 */
export function GroupsListFilters({
  languages,
  levels,
}: {
  languages: { id: string; name: string }[];
  levels: { id: string; levelNumber: number }[];
}) {
  if (languages.length < 2 && levels.length === 0) return null;

  return (
    // `FilterForm` forwards unknown props into react-hook-form's options, not
    // onto the <form>, so the landmark is a wrapper, not an `aria-label`.
    <Box
      role="search"
      aria-label="Filter groups"
      sx={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: 1.5,
        // Each form sizes to its select, instead of each claiming the whole row.
        "& .RaFilterForm-root": { flex: "0 0 auto" },
      }}
    >
      {languages.length > 1 ? (
        <FilterForm
          filters={[
            <SelectInput
              key="language"
              source="language"
              label="Language"
              choices={languages}
              validate={required()}
              alwaysOn
              helperText={false}
              size="small"
              sx={{ width: { xs: "100%", sm: 200 } }}
            />,
          ]}
        />
      ) : null}
      {levels.length > 0 ? (
        <FilterForm
          filters={[
            <SelectInput
              key="level"
              source="level"
              label="Level"
              choices={levels.map((level) => ({
                id: level.id,
                name: `Level ${level.levelNumber}`,
              }))}
              validate={required()}
              alwaysOn
              helperText={false}
              size="small"
              sx={{ width: { xs: "100%", sm: 140 } }}
            />,
          ]}
        />
      ) : null}
    </Box>
  );
}
