import Link from "next/link";

type CurriculumPaginationProps = {
  /** Build the href for the next page — the caller already knows the current search params. */
  nextHref: string | null;
};

/**
 * Forward-only "Next" pagination over the keyset cursor (spec 11 §12).
 * There's no "Previous" button — a correct reverse-direction keyset query
 * would need its own comparison/sort-direction handling, and Unit 3's own
 * verify checklist (language/level/type/status/group/search) doesn't ask
 * for backward paging; the browser's own Back button already returns to
 * the prior page's URL. Worth adding if a real admin workflow asks for it.
 */
export function CurriculumPagination({ nextHref }: CurriculumPaginationProps) {
  if (!nextHref) return null;

  return (
    <div className="mt-4 flex justify-end">
      <Link
        href={nextHref}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        Next page
      </Link>
    </div>
  );
}
