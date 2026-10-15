"use client";

import { useListContext } from "react-admin";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * The designed empty states for the import history (ui-context.md "Interface
 * States"): nothing imported yet, nothing archived, and the one that is easy to
 * miss — a cursor pointing past the end, after the rows beyond it were deleted.
 * That page is empty but the history is not, and it needs a way back, not a
 * "No imports yet" that would be untrue.
 */
export function ImportsListEmpty({
  archived,
  canStart,
}: {
  archived: boolean;
  /** Whether the person may start an import: it decides what the next step is. */
  canStart: boolean;
}) {
  const { hasPreviousPage } = useListContext();

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
            What was here has been removed. Go back to see the rest.
          </Typography>
        </>
      ) : archived ? (
        <>
          <Typography sx={{ fontWeight: 500 }}>Nothing archived</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Archived imports will show up here.
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 500 }}>No imports yet</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {canStart
              ? "Start one with New Import above."
              : "An Admin starts imports."}
          </Typography>
        </>
      )}
    </Box>
  );
}
