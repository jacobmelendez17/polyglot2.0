"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * The designed empty state for the decks list (ui-context.md "Interface
 * States"): a language with no official deck yet. Adding one is the page's
 * "Add deck" command (it needs the deck's items chosen, so it is a specialist
 * dialog and not part of this list), and this says where it is.
 */
export function DecksListEmpty() {
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
        No Polyglot decks yet for this language
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
        Add one to give learners a curated set of published items to practice.
      </Typography>
    </Box>
  );
}
