"use client";

import { useListContext } from "react-admin";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { hasActiveLogFilters, type LogListFilters } from "./logs-list-params";

/**
 * The designed empty states for the audit log (ui-context.md "Interface
 * States"): nothing recorded yet; nothing matching the filters; and the one
 * that is easy to miss — a cursor pointing past the end. That page is empty but
 * the log is not, and it needs a way back, not a "no events" that would be
 * untrue.
 */
export function LogsListEmpty() {
  const { hasPreviousPage, filterValues } = useListContext();
  const filtered = hasActiveLogFilters(filterValues as LogListFilters);

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
            Go back to see the rest.
          </Typography>
        </>
      ) : filtered ? (
        <>
          <Typography sx={{ fontWeight: 500 }}>
            No audit events match these filters
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Try a different filter, or clear one.
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 500 }}>No audit events yet</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Administrative changes are recorded here as they happen.
          </Typography>
        </>
      )}
    </Box>
  );
}
