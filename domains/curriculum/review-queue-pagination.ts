import { AppError } from "@/lib/errors/app-error";

import type { ReviewQueueEntry } from "./curriculum-admin-types";

/**
 * Cursor pagination over the Admin review queue (spec 26 Unit 3) — pure and
 * database-free, so the paging rules are testable without a database.
 *
 * The queue is "everything waiting for an Admin" (new items and edits to
 * published ones). It used to be returned whole; an import of a few thousand
 * pending rows would have meant one enormous response, and code-standards.md
 * allows no unbounded list endpoint. This slices the *same* result, in the
 * *same* order, into pages — so what a reviewer sees is unchanged, only
 * bounded.
 *
 * It is keyed on values, never on position or row identity, which matters
 * more here than almost anywhere: a review queue **shrinks as it is worked**.
 * Publishing the last row of a page removes the very row a cursor was taken
 * from, and an offset (or an "index of the cursor row") would then skip or
 * repeat entries. A cursor that is just a sort key keeps working.
 */

export const REVIEW_QUEUE_MAX_PAGE_SIZE = 100;

export type ReviewQueuePage = {
  entries: ReviewQueueEntry[];
  /** Opaque cursor for the next page, or `null` on the last page. */
  nextCursor: string | null;
  /** Whether a page exists before this one (always `false` without a cursor). */
  hasPreviousPage: boolean;
  /**
   * Cursor that opens the previous page, or `null` when there is no previous
   * page *or* it is the first page (which needs none) — read together with
   * `hasPreviousPage`.
   */
  previousCursor: string | null;
};

type SortKey = Pick<ReviewQueueEntry, "levelNumber" | "itemLabel"> & {
  id: string;
};

function keyOf(entry: ReviewQueueEntry): SortKey {
  return {
    levelNumber: entry.levelNumber,
    itemLabel: entry.itemLabel,
    id: entry.learningItemId,
  };
}

/**
 * The queue's order: level, then label (locale-aware, as the page always
 * sorted it), then id. The id is new and is what makes the order *total* —
 * two homonyms in one level share a label, and without a tiebreak their
 * relative order (and so a page boundary between them) was up to the
 * database.
 */
export function compareReviewKeys(a: SortKey, b: SortKey): number {
  return (
    a.levelNumber - b.levelNumber ||
    a.itemLabel.localeCompare(b.itemLabel) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function sortReviewQueue(
  entries: ReviewQueueEntry[],
): ReviewQueueEntry[] {
  return [...entries].sort((a, b) => compareReviewKeys(keyOf(a), keyOf(b)));
}

function encodeCursor(entry: ReviewQueueEntry): string {
  return Buffer.from(JSON.stringify(keyOf(entry)), "utf8").toString(
    "base64url",
  );
}

function invalidCursor(): AppError {
  return new AppError(
    "CURRICULUM_VALIDATION_FAILED",
    "That page link is not valid. Go back to the first page.",
  );
}

/** A cursor arrives from a URL: malformed or tampered is an expected failure (a 4xx), never a crash. */
function decodeCursor(value: string): SortKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  const candidate = parsed as Partial<SortKey> | null;
  if (
    typeof candidate?.levelNumber !== "number" ||
    typeof candidate.itemLabel !== "string" ||
    typeof candidate.id !== "string"
  ) {
    throw invalidCursor();
  }
  return candidate as SortKey;
}

/**
 * One page of the queue. `entries` need not be pre-sorted.
 *
 * `limit` is clamped to `1..REVIEW_QUEUE_MAX_PAGE_SIZE` here as a backstop;
 * the HTTP boundary validates and rejects out-of-range values itself.
 */
export function paginateReviewQueue(
  entries: ReviewQueueEntry[],
  { limit, cursor }: { limit: number; cursor?: string | null },
): ReviewQueuePage {
  const size = Math.min(
    Math.max(Math.trunc(limit) || 1, 1),
    REVIEW_QUEUE_MAX_PAGE_SIZE,
  );
  const sorted = sortReviewQueue(entries);

  // Index of the first entry strictly after the cursor's key — everything
  // before it is "at or before the cursor", i.e. earlier pages.
  let start = 0;
  if (cursor) {
    const after = decodeCursor(cursor);
    start = sorted.findIndex(
      (entry) => compareReviewKeys(keyOf(entry), after) > 0,
    );
    if (start === -1) start = sorted.length;
  }

  const page = sorted.slice(start, start + size);
  const last = page[page.length - 1];
  const hasNextPage = start + page.length < sorted.length;

  // The previous page is the `size` entries ending just before `start`; the
  // entry before *those* is the row it begins after.
  const previousAnchor = start - size - 1;
  return {
    entries: page,
    nextCursor: hasNextPage && last ? encodeCursor(last) : null,
    hasPreviousPage: start > 0,
    previousCursor:
      start > 0 && previousAnchor >= 0
        ? encodeCursor(sorted[previousAnchor]!)
        : null,
  };
}
