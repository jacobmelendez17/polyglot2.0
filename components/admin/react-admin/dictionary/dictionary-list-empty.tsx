"use client";

import { useListContext } from "react-admin";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { hasActiveDictionaryFilters } from "./dictionary-list-params";
import type { DictionaryListFilters } from "./dictionary-list-params";

/**
 * The designed empty states for the mapping queue (ui-context.md "Interface
 * States"): nothing in the language yet; nothing matching the filters; and the
 * one that is easy to miss — an offset past the end, after the rows beyond it
 * were removed. That page is empty but the queue is not, and it needs a way
 * back, not a "no vocabulary" that would be untrue.
 */
export function DictionaryListEmpty() {
  const { hasPreviousPage, filterValues } = useListContext();
  const filtered = hasActiveDictionaryFilters(
    filterValues as DictionaryListFilters,
  );

  return (
    <Box
      sx={{
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        p: 4,
        textAlign: "center",
      }}
    >
      {hasPreviousPage ? (
        <>
          <Typography sx={{ fontWeight: 500 }}>
            There is nothing more on this page
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            What was here has changed. Go back to see the rest.
          </Typography>
        </>
      ) : filtered ? (
        <>
          <Typography sx={{ fontWeight: 500 }}>
            No vocabulary matches these filters
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Try a different filter, or clear one.
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 500 }}>
            No vocabulary in this language yet
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Words appear here once they are added to the curriculum.
          </Typography>
        </>
      )}
    </Box>
  );
}
