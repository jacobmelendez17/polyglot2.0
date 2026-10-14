"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

/**
 * The designed empty states for the account list (ui-context.md "Interface
 * States"): a search that matches no one — which says what was searched for and
 * how to get out — and, for completeness, no accounts at all (not reachable by
 * an Admin, who is one, but never a blank panel).
 */
export function UsersListEmpty({
  search,
  onClearSearch,
}: {
  search: string | undefined;
  onClearSearch: () => void;
}) {
  return (
    <Box
      sx={{
        border: "1px solid var(--border-default)",
        borderRadius: "calc(var(--radius) * 1.4)",
        p: 4,
        textAlign: "center",
      }}
    >
      {search ? (
        <>
          <Typography sx={{ fontWeight: 500 }}>
            No one matches “{search}”
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Try part of a name or username, or paste an account id.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button variant="outlined" color="inherit" onClick={onClearSearch}>
              Clear search
            </Button>
          </Box>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 500 }}>No accounts yet</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Accounts appear here once people sign up.
          </Typography>
        </>
      )}
    </Box>
  );
}
