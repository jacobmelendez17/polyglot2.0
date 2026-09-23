"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { CurriculumStatusBadge } from "./curriculum-status-badge";
import type { AdminCurriculumListItem } from "@/domains/curriculum";

const TYPE_LABEL = { vocabulary: "Vocab", grammar: "Gram" } as const;

type CurriculumTableProps = {
  items: AdminCurriculumListItem[];
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleAll: () => void;
};

/** Spec 11 §9's admin curriculum table, now with a real Actions column linking to the item editor and a selection checkbox column feeding spec 11 rewrite's "Bulk Actions" bar. */
export function CurriculumTable({
  items,
  selectedIds,
  onToggleItem,
  onToggleAll,
}: CurriculumTableProps) {
  // Carries the current filters/search/pagination through to the item
  // editor and back again, so following a row and clicking "Back to
  // Curriculum" from there restores this exact view instead of the admin
  // needing to redo their filters. The sidebar's own "Curriculum" link has
  // no query string and is left alone, so it still resets to a blank view.
  const searchParams = useSearchParams();
  const fromQuery = searchParams.toString();

  function itemHref(itemId: string) {
    return fromQuery
      ? `/admin/curriculum/items/${itemId}?from=${encodeURIComponent(fromQuery)}`
      : `/admin/curriculum/items/${itemId}`;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">
          No curriculum items match these filters
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try a different search term, or clear a filter.
        </p>
      </div>
    );
  }

  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));

  /*
   * `[contain:paint]` is load-bearing, not cosmetic — see
   * `components/admin/dictionary/mapping-queue-table.tsx`, which documents
   * the same pre-existing problem on this exact table (measured at a 390px
   * viewport: `documentElement.scrollWidth` 513, `window.scrollX` reaching
   * 123 after a scroll attempt) and the live-tested candidates that did not
   * work (`width:100%`, `max-width:100%`, `overflow-x:clip`,
   * `display:grid`). Safe here for the same reason: nothing inside is
   * absolutely or fixed positioned.
   */
  return (
    <div className="overflow-x-auto rounded-xl border border-border [contain:paint]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="w-8 px-3 py-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label="Select all items on this page"
              />
            </th>
            <th scope="col" className="px-3 py-2">
              Type
            </th>
            <th scope="col" className="px-3 py-2">
              Item
            </th>
            <th scope="col" className="px-3 py-2">
              Meaning
            </th>
            <th scope="col" className="px-3 py-2">
              Level
            </th>
            <th scope="col" className="px-3 py-2">
              Group
            </th>
            <th scope="col" className="px-3 py-2">
              Status
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="relative border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="relative z-10 px-3 py-2">
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => onToggleItem(item.id)}
                  aria-label={`Select ${item.itemLabel}`}
                />
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {TYPE_LABEL[item.type]}
              </td>
              <td className="px-3 py-2 font-medium text-foreground">
                <Link
                  href={itemHref(item.id)}
                  className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.itemLabel}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {item.meaningLabel}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {item.levelNumber}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {item.groupName ?? "—"}
              </td>
              <td className="px-3 py-2">
                <CurriculumStatusBadge status={item.status} />
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground">
                <ChevronRight className="ml-auto h-4 w-4" aria-hidden="true" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
