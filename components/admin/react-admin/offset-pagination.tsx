"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { ChevronLeft, ChevronRight } from "lucide-react";

type OffsetPaginationProps = {
  from: number;
  to: number;
  total: number | undefined;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  /** The page on screen is stale while the next one loads; moving from it would skip or repeat a page. */
  locked: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

/**
 * Previous / Next for offset-paginated lists that know their total, with where
 * the page is in it ("1–25 of 130"). There is deliberately no jump-to-page: the
 * queue is worked from the top, and arbitrary page numbers would only invite
 * landing past the end.
 *
 * Renders nothing when the whole list fits on one page and nothing precedes it.
 *
 * An empty page *past the end* (what was there has since been removed) has no
 * range to give — "0–1000 of 27" would be nonsense — so it says how many there
 * are in all, and "Previous page" is the way back.
 */
export function OffsetPagination({
  from,
  to,
  total,
  hasPreviousPage,
  hasNextPage,
  locked,
  onPrevious,
  onNext,
}: OffsetPaginationProps) {
  if (!hasPreviousPage && !hasNextPage) return null;

  const position =
    from === 0
      ? total === undefined
        ? ""
        : `${total} in all`
      : total === undefined
        ? `${from}–${to}`
        : `${from}–${to} of ${total}`;

  return (
    <Box
      component="nav"
      aria-label="Pagination"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 1,
        mt: 2,
      }}
    >
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {position}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
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
    </Box>
  );
}
