"use client";

import NextLink from "next/link";
import { useListContext } from "react-admin";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import {
  hasActiveFilters,
  type CurriculumListFilters,
} from "./curriculum-list-params";

/**
 * The designed empty state (ui-context.md "Interface States"). "Nothing here
 * yet" and "nothing matches your filters" are different situations that need
 * different words and a different next step, so they are told apart — the
 * pre-migration table only had the second.
 */
export function CurriculumListEmpty() {
  const { filterValues, setFilters } = useListContext();
  const filters = filterValues as CurriculumListFilters;
  const filtered = hasActiveFilters(filters);

  return (
    <Box
      sx={{
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        p: 4,
        textAlign: "center",
      }}
    >
      <Typography sx={{ fontWeight: 500 }}>
        {filtered
          ? "No curriculum items match these filters"
          : "No curriculum items in this language yet"}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
        {filtered
          ? "Try a different search term, or clear a filter."
          : "Add an item, or import a file, to start building this language's curriculum."}
      </Typography>
      <Box sx={{ mt: 2 }}>
        {filtered ? (
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => setFilters({ language: filters.language }, {})}
          >
            Clear filters
          </Button>
        ) : (
          <Button
            component={NextLink}
            href={`/admin/curriculum/items/new?language=${filters.language}`}
            variant="contained"
          >
            Add item
          </Button>
        )}
      </Box>
    </Box>
  );
}
