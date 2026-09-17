"use client";

import { useState } from "react";

import type { AdminCurriculumListItem } from "@/domains/curriculum";

import { BulkActionsBar } from "./bulk-actions-bar";
import { CurriculumTable } from "./curriculum-table";

type CurriculumTableSectionProps = {
  items: AdminCurriculumListItem[];
  levels: { id: string; levelNumber: number }[];
  groups: { id: string; name: string; levelNumber: number }[];
};

/**
 * Owns bulk-selection state so it survives across `CurriculumTable`/
 * `BulkActionsBar` re-renders, and clears it whenever the underlying item
 * list changes — a new filter, a new page, or a completed bulk action's own
 * `router.refresh()`. Resets by comparing `items` during render (React's
 * documented "adjusting state when a prop changes" pattern), not inside a
 * `useEffect` — a `useEffect` here would set state one render late,
 * flashing the stale selection against the new list first.
 */
export function CurriculumTableSection({
  items,
  levels,
  groups,
}: CurriculumTableSectionProps) {
  const [priorItems, setPriorItems] = useState(items);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (items !== priorItems) {
    setPriorItems(items);
    setSelectedIds(new Set());
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      items.every((item) => prev.has(item.id))
        ? new Set()
        : new Set(items.map((item) => item.id)),
    );
  }

  const selectedItems = items.filter((item) => selectedIds.has(item.id));

  return (
    <div>
      {selectedItems.length > 0 ? (
        <BulkActionsBar
          selectedItems={selectedItems}
          levels={levels}
          groups={groups}
          onDone={() => setSelectedIds(new Set())}
        />
      ) : null}
      <CurriculumTable
        items={items}
        selectedIds={selectedIds}
        onToggleItem={toggleItem}
        onToggleAll={toggleAll}
      />
    </div>
  );
}
