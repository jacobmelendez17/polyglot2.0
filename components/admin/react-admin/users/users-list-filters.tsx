"use client";

import { FilterForm, TextInput } from "react-admin";

/**
 * The account list's one filter, as a React Admin filter input (spec 26 Unit
 * 6): a search over display name, username, or an exact account id (the id an
 * audit entry names).
 *
 * `FilterForm` reads and writes the surrounding `ListContext`: its value comes
 * from the URL and an edit goes back out through `setFilters`, which navigates.
 * Typing is debounced by React Admin (500 ms), then replaces the address
 * instead of stacking a history entry per keystroke.
 *
 * There is no role filter and no "show sandbox accounts": the server offers
 * neither, and the list never would.
 */
export function UsersListFilters() {
  return (
    // `FilterForm` forwards unknown props into react-hook-form's options, not
    // onto the <form>, so the landmark is a wrapper, not an `aria-label`.
    <div role="search" aria-label="Find users">
      <FilterForm
        filters={[
          <TextInput
            key="search"
            source="search"
            label="Search users"
            placeholder="Name, username or account id"
            type="search"
            resettable
            alwaysOn
            helperText={false}
            size="small"
            sx={{
              width: { xs: "100%", sm: 340 },
              // Chromium and Safari draw a clear button of their own inside a
              // search input; the resettable one is the same in every browser,
              // so the native one would only be a second ✕ beside it.
              "& input::-webkit-search-cancel-button": { display: "none" },
            }}
          />,
        ]}
      />
    </div>
  );
}
