"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CursorPaginationProps = {
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  /** The page on screen is stale while the next one loads; its cursors must not be used. */
  locked: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

/**
 * Previous / Next for keyset-paginated lists. There is deliberately no page
 * count, no "page 3 of 12", and no jump-to-page: a cursor list cannot know
 * them without an exact count over an unbounded table (code-standards.md
 * "Pagination and Query Conventions"), and inventing them would be wrong.
 *
 * Renders nothing when the whole list fits on one page.
 */
export function CursorPagination({
  hasPreviousPage,
  hasNextPage,
  locked,
  onPrevious,
  onNext,
}: CursorPaginationProps) {
  if (!hasPreviousPage && !hasNextPage) return null;

  return (
    <Box
      component="nav"
      aria-label="Pagination"
      sx={{
        display: "flex",
        justifyContent: "space-between",
        gap: 1,
        mt: 2,
      }}
    >
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<ChevronLeft size={16} aria-hidden="true" />}
        disabled={!hasPreviousPage || locked}
        onClick={onPrevious}
      >
        Previous page
      </Button>
      <Button
        variant="outlined"
        color="inherit"
        endIcon={<ChevronRight size={16} aria-hidden="true" />}
        disabled={!hasNextPage || locked}
        onClick={onNext}
      >
        Next page
      </Button>
    </Box>
  );
}
