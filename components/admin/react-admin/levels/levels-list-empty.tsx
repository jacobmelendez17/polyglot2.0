"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

/**
 * The designed empty state for the levels list (ui-context.md "Interface
 * States"): a language with no levels yet. For someone who may add one it is
 * an invitation, with the action right there; for anyone else it says whose
 * job it is, instead of a dead end.
 */
export function LevelsListEmpty({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
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
      <Typography sx={{ fontWeight: 500 }}>
        No levels yet for this language
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
        {canCreate
          ? "Add the first level, then build out its curriculum from the Curriculum page."
          : "An Admin adds levels."}
      </Typography>
      {canCreate ? (
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={onCreate}>
            Add level
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}
