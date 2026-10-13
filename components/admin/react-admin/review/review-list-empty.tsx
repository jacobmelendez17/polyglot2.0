"use client";

import NextLink from "next/link";
import { useListContext } from "react-admin";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

/**
 * The designed empty states for the queue (ui-context.md "Interface States").
 *
 * Nothing waiting is the *good* outcome — a success state, not a failure —
 * so it says so. The other case is easy to miss in a queue that shrinks as
 * it is worked: a cursor pointing past the end, after everything beyond it was
 * published. That page is empty but the queue is not, and it needs a way back,
 * not a "nothing is waiting" that would be untrue.
 */
export function ReviewListEmpty() {
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
            What was here has been published or removed. Go back to see what is
            still waiting.
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 500 }}>Nothing is waiting</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            Every item is either published or archived.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button
              component={NextLink}
              href="/admin/curriculum"
              variant="outlined"
              color="inherit"
            >
              Browse the curriculum
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
